#!/bin/bash
set -e

SVC="{{SVC}}"

#1 uri
#2 match
#3 (optional) svc_bootstrap
read_sh() {
  local uri=${1#/}
  local match=$2
  local svc=${3:-${svc_bootstrap}}
  local res
  res=$(curl -sSL "${svc}/sh/bindings/${uri}")
  if [[ "$res" =~ ^"$match" ]]; then
    sed '1d' <<< "$res"
    return 0
  else
    echo "$res" >&2
    return 1
  fi
}

#1 svc_bootstrap
read_bindings() {
  binding=$(read_sh "/" "#bindings#" "$1")
}

#1 binding
read_params_missing() {
  params_missing=$(read_sh "/$1/missing" "#params-missing#")
}

#1 binding
#2 param name
read_default_missing() {
  unset _default _regex_validate
  if missing=$(read_sh "/$1/missing/$2" "#missing#"); then
    while IFS= read -r line; do
      k="${line%%=*}"
      v="${line#*=}"
      if [ "${k:0:2}" = "__" ]; then
        read $k <<< "$(bash -c "$v")"
      elif [ "${k:0:1}" = "_" ]; then
        read $k <<< "$v"
      fi
    done <<< "$missing"
    if [ -n "$_default" ]; then
      # Yes, eval is evil. I trust the source.
      read $2 <<< "$(eval echo \"$_default\")"
    fi
    return 0
  else
    return 1
  fi
}

#1 value
validate_missing() {
  if egrep '[& ]' <<< "$1"; then
    return 1
  elif [ -n "$_regex_validate" ]; then
    eval egrep -q \"$_regex_validate\" <<< "$1"
  else
    return 0
  fi
}

#1 binding
read_install_params() {
  if install_params=$(read_sh "/$1/install" "#install-params#"); then
    while IFS="=" read -r k v; do
      read $k <<< "$v"
    done <<< "$install_params"
    return 0
  else
    return 1
  fi
}

#1 group name
#2 param name
default_val() {
  case "$1" in
    missing) read_default_missing "$binding" "$2" || return 1;;
  esac
  case "$2" in
    svc_bootstrap) svc_bootstrap="$SVC";;
  esac
  return 0
}

#1 group name
#2 param name
#3 value
valid() {
  case "$1" in
    missing) validate_missing "$3" || return 1;;
  esac
  case "$2" in
    svc_bootstrap) read_bindings "$3";;
    binding) read_params_missing "$3" && read_install_params "$3";;
  esac
}

#1 group name
#2... params
read_params() {
  groupName=$1
  shift
  for param in "$@"; do
    while true; do
      default_val "$groupName" "$param"
      echo -n "$param [${!param}]: "
      read paramvalue
      if [ -z "$paramvalue" ]; then
        paramvalue=${!param}
      fi
      if [ -z "$paramvalue" ]; then
        echo "Param is mandatory!"
      elif ! valid "$groupName" "$param" "$paramvalue"; then
        echo "Invalid content: $paramvalue"
      else
        read $param <<< "$paramvalue"
        export $param
        break
      fi
    done
  done
}

read_cloud_config() {
  build_missing=
  for missing in $params_missing; do
    build_missing+="${missing}=${!missing}&"
  done
  build_missing="${build_missing%&}"
  res=$(curl -sSL "${svc_bootstrap}/api/bindings/${binding}?$build_missing")
  if [[ ! "$res" =~ ^#cloud-config ]]; then
    echo >&2
    echo "$res" >&2
    exit 1
  fi
  cloud_config="$res"
}


#1... params
ask_to_only_generate() {
  echo "============"
  echo
  for param in $*; do
    printf '%16s: %s\n' "$param" "${!param}"
  done
  echo
  echo "============"
  echo

  action=
  while [[ ! "$action" =~ ^[IiGg]$ ]]; do
    echo -n "Proceed to [i]nstall or just [g]enerate cloud-config? [i|g]: "
    read action
  done

  [[ "$action" =~ ^[Gg]$ ]]
}

save_cloud_config() {
  tmp=$(mktemp)
  echo "$cloud_config" > "$tmp"
  echo "Cloud config saved to '$tmp'"
}

#1... params
ask_to_install() {
  action=
  while [[ ! "$action" =~ ^[YyNn]$ ]]; do
    echo -n "OK to install? [y|n]: "
    read action
  done

  [[ "$action" =~ ^[Yy]$ ]]
}

#1 cloud-config
do_install() {
  tmp=$(mktemp)
  trap "rm -f $tmp" EXIT
  echo "$1" > "$tmp"
  echo "coreos-install -d $device -b $image_mirror -C $coreos_channel -V $coreos_version -c cloud-config.yml"
  sudo coreos-install \
    -d "$device" \
    -b "$image_mirror" \
    -C "$coreos_channel" \
    -V "$coreos_version" \
    -c "$tmp" && sudo reboot
}

sleep 0.5

params_bootstrap="svc_bootstrap binding"
echo
echo "=== Bootstrap service params"
read_params "bootstrap" $params_bootstrap

if [ -n "$params_missing" ]; then
  echo
  echo "=== Missing params"
  read_params "missing" $params_missing
fi

read_cloud_config

if ask_to_only_generate $params_bootstrap $params_missing; then
  save_cloud_config
else
  params_installation="device image_mirror coreos_channel coreos_version"
  echo
  echo "=== Installation params"
  read_params "install" $params_installation

  echo
  if ask_to_install $params_bootstrap $params_missing $params_installation; then
    echo
    do_install "$cloud_config"
  else
    save_cloud_config
  fi
fi
