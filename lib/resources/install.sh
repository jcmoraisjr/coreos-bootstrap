#!/bin/bash
set -e
set -o pipefail

SVC="{{SVC}}"

die() { echo "$*" >&2; exit 1; }

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
  # global: binding
  #
  # $binding receives a pipe `|` separated list of bindings as it's default value
  binding=$(read_sh "/" "#bindings#" "$1")
}

#1 binding
read_params_missing() {
  # global: params_missing
  #
  # $params_missing receives a space ` ` separated list of missing parameters
  # to be queried to the sysadmin
  params_missing=$(read_sh "/$1/missing" "#params-missing#")
}

#1 binding
read_export_view() {
  # globals: non missing attributes from CoreOS Bootstrap view
  #
  # read and export all attributes from the view (non missing params) in order to
  # be used by `_install_params` and `__user_defined` internal attributes of missings
  if view=$(read_sh "/$1/view" "#view#"); then
    while IFS="=" read -r k v; do
      if [[ "$k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        read $k <<< "$v"
        export $k
      fi
    done <<< "$view"
  fi
}

#1 binding
#2 param name
read_missing() {
  # globals: `_*` and `__*` from missing configuration
  #
  # read `_install_params` and `__user_defined` internal attributes from missing
  # configuration
  # read also the default value of a param
  local missing k v
  unset _help _default _regex_validate
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
  # globals: device image_mirror coreos_channel coreos_version
  #
  # read params used by coreos-install
  local install_params line
  if install_params=$(read_sh "/$1/install" "#install-params#"); then
    while IFS= read -r line; do
      read ${line%%=*} <<< "${line#*=}"
    done <<< "$install_params"
    return 0
  else
    return 1
  fi
}

#1 group name
#2 param name
pre_proc() {
  case "$1" in
    missing)
      read_missing "$binding" "$2" || return 1
      # Yes, eval is evil. I trust the source.
      [ -n "$_default" ] && read $2 <<< "$(eval echo \"$_default\")"
      [ -n "$_help" ] && eval echo ":: $_help"
      ;;
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
    # binding validation used, also, as a trigger to read default values for
    # missing and installation stuf
    binding) read_params_missing "$3" && read_install_params "$3" && read_export_view "$3";;
  esac
}

#1 group name
#2... params
read_params() {
  # globals: all params starting from arg 2
  #
  # read params from user input
  local groupName first param value
  groupName=$1
  shift
  for param in "$@"; do
    first=1
    while true; do
      [ $first ] && pre_proc "$groupName" "$param"
      first=
      echo -n "$param [${!param}]: "
      read value
      if [ -z "$value" ]; then
        value=${!param}
      fi
      if [ -z "$value" ]; then
        echo "Param is mandatory!"
      elif ! valid "$groupName" "$param" "$value"; then
        echo "Invalid content: $value"
      else
        read $param <<< "$value"
        export $param
        break
      fi
    done
  done
}

#stdout new cloud-config content
read_cloud_config() {
  local build_missing missing res
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
  echo "$res"
}

#1... executables
exec_exists() {
  for b in "$@"; do
    which "$b" >/dev/null 2>&1 && return 0
  done
  return 1
}

#1 tmpdir
#2 user_data file
#3 output file
make_configdrive() {
  local param_tmp param_user_data param_output_iso tmpiso
  param_tmp=$1
  param_user_data=$2
  param_output_iso=$3
  tmp_iso="${param_tmp}/iso"
  if exec_exists mkisofs hdiutil; then
    mkdir -p "${tmp_iso}/openstack/latest"
    cp "$param_user_data" "${tmp_iso}/openstack/latest/user_data"
    if exec_exists mkisofs; then
      mkisofs -quiet -rock -volid config-2 -input-charset utf-8 -o "$param_output_iso" "$tmp_iso"
    else
      hdiutil makehybrid -quiet -iso -joliet -default-volume-name config-2 -o "$param_output_iso" "$tmp_iso"
    fi
  fi
}

#1 cloud-config
cloud_config_no_changes() {
  # diff returns true (0) if the files don't differ
  sudo diff -q "$1" "$user_data_file" >/dev/null
}

#1 msg with what to [d]o -- do not use [g] ;)
#2... params
ask_to_only_generate() {
  local msg opt sel param value action
  msg=$1
  shift
  echo
  echo "============"
  echo
  for param in $*; do
    value=${!param}
    printf '%16s:  %s\n' \
      "$param" \
      "$([ ${#value} -gt 58 ] && echo "${value:0:27}_..._${value:$((${#value}-26))}" || echo "$value")"
  done
  echo
  echo "============"
  echo

  sel=$(sed 's/.*\[\([a-z]\)\].*/\1/' <<< "$msg")  # one char, lower case
  opt="$(tr '[a-z]' '[A-Z]' <<< "$sel")$sel"       # two chars, upper and lower case

  action=
  while [[ ! "$action" =~ ^["${opt}"Gg]$ ]]; do
    echo -n "Proceed to $msg or just [g]enerate cloud-config? [${sel}|g]: "
    read action
  done

  [[ "$action" =~ ^[Gg]$ ]]
}

#1 tmpdir with user_data and, perhaps, configdrive.iso
save_cloud_config() {
  local tmp user_data_file configdrive_file
  tmp=$(mktemp -d)
  user_data_file="${1}/user_data"
  configdrive_file="${1}/configdrive.iso"
  mv "$user_data_file" "${tmp}/"
  if [ -f "$configdrive_file" ]; then
    mv "$configdrive_file" "${tmp}/"
    echo "user_data and configdrive.iso saved to '${tmp}/'"
  else
    echo "Saved to '${tmp}/user_data'"
  fi
}

#1 cloud-config
ask_to_update() {
  local action
  sudo diff -u "$user_data_file" "$1"
  echo
  echo "============"
  echo
  action=
  while [[ ! "$action" =~ ^[YyNn]$ ]]; do
    echo -n "OK to overwrite user_data and execute coreos-cloudinit? [y|n]: "
    read action
  done
  [[ "$action" =~ ^[Yy]$ ]]
}

#1 msg, default is "install"
ask_to_install() {
  local action msg
  msg="${1:-install}"
  action=
  while [[ ! "$action" =~ ^[YyNn]$ ]]; do
    echo -n "OK to ${msg}? [y|n]: "
    read action
  done
  [[ "$action" =~ ^[Yy]$ ]]
}

#1 cloud-config
do_update() {
  sudo mv "$1" "$user_data_file"
  echo "coreos-cloudinit --from-file $user_data_file"
  sudo coreos-cloudinit --from-file "$user_data_file"
  echo
  echo "Successfully applied!"
  echo "Note that only 'restart'ed units will have their changes applied."
}

#1 cloud-config
do_install() {
  echo "coreos-install -d $device -b $image_mirror -C $coreos_channel -V $coreos_version -c cloud-config.yml"
  sudo coreos-install \
    -d "$device" \
    -b "$image_mirror" \
    -C "$coreos_channel" \
    -V "$coreos_version" \
    -c "$1"
  sudo eject || :
  echo "Now you can look around and if everything is ok just type: sudo reboot"
}

#1 tmpdir with user_data and configdrive.iso
do_provision_libvirt() {
  local vm_dir vm_disk vm_iso
  vm_dir=$(virsh -c "$virt_hypervisor" pool-dumpxml $virt_pool_name | sed -n 's/.*<path>\(.*\)<\/path>.*/\1/p')
  vm_disk="${vm_dir}/${virt_name}_disk.img"
  vm_iso="${vm_dir}/${virt_name}_configdrive.iso"
  [ -f "$vm_disk" ] && die "Disk already exists: $vm_disk"
  echo "Creating new image: $vm_disk"
  cp "$virt_image" "$vm_disk"
  virsh --connect "$virt_hypervisor" pool-refresh "$virt_pool_name"
  if [ $virt_disksize -gt 8 ]; then
    virsh --connect "$virt_hypervisor" vol-resize "$vm_disk" "${virt_disksize}GiB"
  fi
  cp "${1}/configdrive.iso" "$vm_iso"
  virt-install \
    --connect "$virt_hypervisor" \
    --import --accelerate --noautoconsole \
    --os-type=linux --os-variant=virtio26 \
    --name "$virt_name" \
    --ram "$virt_ram" --vcpus "$virt_vcpu" \
    --disk path="$vm_disk",device=disk,format=raw,bus=virtio \
    --disk path="$vm_iso",device=cdrom,format=raw,bus=ide \
    --network bridge="$virt_bridge_network"
  echo
  echo "Domain '$virt_name' successfully started"
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

user_data_file="/var/lib/coreos-install/user_data"
tmp=$(mktemp -d)
trap "rm -rf $tmp" EXIT
cloud_config="${tmp}/user_data"
read_cloud_config > "$cloud_config"
configdrive="${tmp}/configdrive.iso"
make_configdrive "${tmp}" "$cloud_config" "$configdrive"

grep -q CoreOS /etc/os-release 2>/dev/null && is_coreos=1 || is_coreos=
[ -d /var/lib/coreos-install ] && is_installed=1 || is_installed=

if [ $is_coreos ]; then
  [ $is_installed ] && action="[u]pdate" || action="[i]nstall"
  if [ $is_installed ] && cloud_config_no_changes "$cloud_config"; then
    echo
    echo "============"
    echo
    echo "Local user_data is already updated!"
    echo "If you want to apply the actual configuration:"
    echo
    echo "    sudo coreos-cloudinit --from-file $user_data_file"
    echo
  elif ask_to_only_generate "$action" $params_bootstrap $params_missing; then
    save_cloud_config "$tmp"
  elif [ $is_installed ]; then
    echo
    if ask_to_update "$cloud_config"; then
      echo
      do_update "$cloud_config"
    else
      save_cloud_config "$tmp"
    fi
  else
    params_installation="device image_mirror coreos_channel coreos_version"
    echo
    echo "=== Installation params"
    read_params "install" $params_installation
    echo
    if ask_to_install; then
      echo
      do_install "$cloud_config"
    else
      save_cloud_config "$tmp"
    fi
  fi
else #if it's not CoreOS, look for a hypervisor
  if exec_exists virt-install && exec_exists virsh; then
    if ask_to_only_generate "provision with [l]ibvirt" $params_bootstrap $params_missing; then
      save_cloud_config "$tmp"
    else
      echo
      # # # # # # # # # # # # # # # # # # # # # # # # # # #
      # TODO move to model
      #
      virt_hypervisor="qemu:///system"
      virt_image="$(pwd)/coreos_qemu.img"
      virt_pool_name="pool1"
      virt_name="coreos_$(sed 's/.*\.//' <<< "$ipaddress")"
      virt_ram="1024"
      virt_vcpu="1"
      virt_disksize="8"
      virt_bridge_network=$(ip a | sed -n 's/[0-9]*: \([a-z0-9]*\): .*/\1/p' | tr '\n' '|')
      #
      # # # # # # # # # # # # # # # # # # # # # # # # # # #
      echo "=== Provision params (libvirt)"
      params_provision="virt_hypervisor virt_image virt_pool_name virt_name virt_ram virt_vcpu virt_disksize virt_bridge_network"
      read_params "provision" $params_provision
      echo
      if ask_to_install "provision to ${virt_pool_name}::${virt_name}"; then
        echo
        do_provision_libvirt "$tmp"
      else
        save_cloud_config "$tmp"
      fi
    fi
  else #if it's not CoreOS and no hypervisor was found
    save_cloud_config "$tmp"
  fi
fi
