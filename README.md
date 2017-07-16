# CoreOS Bootstrap

CoreOS's Container Linux bootstrap engine.

CoreOS Bootstrap merges partial configuration files, apply predefined or on demand data, and generates complete [cloud-config](https://coreos.com/os/docs/latest/cloud-config.html) file for CoreOS's Container Linux hosts.

Configuration render uses [{{Mustache}}](http://mustache.github.io) templates, so everything it's [JavaScript](https://github.com/janl/mustache.js) implementation supports, CoreOS Bootstrap should support as well.

CoreOS Bootstrap also provides a simple-to-use provision / installation / update script.

[![Docker Repository on Quay](https://quay.io/repository/jcmoraisjr/coreos-bootstrap/status "Docker Repository on Quay")](https://quay.io/repository/jcmoraisjr/coreos-bootstrap)

# Usage

Running with Node.js:

```console
npm install --production ## Only in the first time
node bootstrap.js -c sample
```

Running as a Docker container - you should copy `sample` directory if using Docker on a VM, like Docker Machine:

```console
docker run -d -v ${PWD}/sample:/opt/sample -p 8080:8080 \
  quay.io/jcmoraisjr/coreos-bootstrap -c /opt/sample
```

Both Node.js and Docker samples above uses `sample` config directory. A config directory has:

* `config-*.yaml`: partial cloud-config files and `{{mustache}}` tags
* `data-*.yaml`: data used to populate Mustache tags
* `model.yaml`: config+data bindings as well as default values for the installation script

Running tests:

```console
npm install ## Only in the first time
npm test
```

## Generate a cloud-config

Create a `user_data` file (see `sample/config-core.yaml` and `sample/data-common.yaml`). POST config, data and missing properties as a JSON object to `/api/config`:

```console
curl \
  -H 'Content-Type: application/json' \
  -d '
  {
    "config": ["core"],
    "data": ["common"],
    "properties": {
      "network_intf": "eth0",
      "ipaddress": "192.168.1.10",
      "ipmask": "24",
      "gateway": "192.168.1.1"
    }
  }' \
  -o user_data \
  127.0.0.1:8080/api/config
```

GET the same `user_data` file using a binding (see `sample/model.yaml`):

```console
curl -o user_data '
  127.0.0.1:8080/api/bindings/core?
  network_intf=eth0&
  ipaddress=192.168.1.10&
  ipmask=24&
  gateway=192.168.1.1'
```

Manual provided properties, like `ipaddress` or `gateway` above, will override properties with the same name provided from data.

## Installation script

Start the installation script from a CoreOS host running the CoreOS [ISO](https://stable.release.core-os.net/amd64-usr/current/coreos_production_iso_image.iso) image, or any other live CD with `coreos-install` and `bash`.

## Assign a public IP address

The installation script need to connect the CoreOS Bootstrap. If you have connectivity, jump to *Running the installation script* below.

But if you don't have a DHCP server or if for some reason the public network interface doesn't have a valid IP address (check with `ip a`), you cannot access the CoreOS Bootstrap service. If so, follow this steps:

Check the name of the public network interface on the CoreOS host:

```console
ip a
``console

Change, below, `192.168.1.11` to a valid IP address on the network, `24` to the network mask and `eth0` to the name of the public network interface.

```console
sudo ip addr add 192.168.1.11/24 dev eth0
```

Now `ip a` should list the public IP address. So let's configure CoreOS.

## Running the installation script

Change `192.168.1.10:8080` below to the endpoint of the CoreOS Bootstrap service:

```console
bash <(curl 192.168.1.10:8080)
```

... and follow the script. The installation process should take some time to download the CoreOS image.

**Tip:** create a [mirror](https://stable.release.core-os.net/amd64-usr/) on your network, update `sample/model.yaml` and save some bandwidth.

After the installation process and the reboot, ssh to the CoreOS host. Change `192.168.1.11` below to it's public IP address:

```console
ssh -i sample/id_rsa core@192.168.1.11
```

## Update CoreOS

The same script used to install should also be used to update CoreOS configuration. Change `192.168.1.10:8080` below to the endpoint of the CoreOS Bootstrap service and run on the CoreOS host to be updated:

```console
bash <(curl 192.168.1.10:8080)
```

## Provisioning CoreOS

The installation script can also be used on the host side to provision CoreOS. At this moment only libvirt is supported.

### Libvirt

Configure a bridge network so that CoreOS VMs can have routable IPs. Fedora doc [here](https://docs.fedoraproject.org/en-US/Fedora/17/html/System_Administrators_Guide/s2-networkscripts-interfaces_network-bridge.html), or, in short (Fedora and CentOS steps):

* Check with `ip a` the device of the public IP
* On directory `/etc/sysconfig/network-scripts`, copy `ifcfg-<**your-device**>` to `ifcfg-br0` and also to a backup
* On `ifcfg-br0` leave all but four lines untouched: change `TYPE=Bridge`, `DEVICE=br0`, and remove `NAME=` and `UUID=`
* On `ifcfg-<**your-device**>` leave only `HWADDR`, `TYPE`, `BOOTPROTO`, `ONBOOT`, `DEVICE=<**your-device**>`, add `BRIDGE=br0` and remove the others
* `sudo systemctl restart network`, if everything sounds ok `sudo reboot` and hope the best

Quick steps to install libvirt/qemu/kvm and some dependencies of the installation script on a Fedora/CentOS7/RHEL7 host:

```console
# Change yum to dnf on Fedora
sudo yum install -y libvirt virt-install virt-manager virt-viewer \
  qemu-kvm bridge-utils bind-utils net-tools genisoimage
sudo systemctl start libvirtd
sudo systemctl enable libvirtd
```

Steps to install Kimchi, a web GUI to your host and VMs:

```console
# Change yum to dnf on Fedora
sudo yum install -y \
  http://kimchi-project.github.io/wok/downloads/latest/wok.el7.centos.noarch.rpm \
  http://kimchi-project.github.io/gingerbase/downloads/latest/ginger-base.el7.centos.noarch.rpm \
  http://kimchi-project.github.io/kimchi/downloads/latest/kimchi.el7.centos.noarch.rpm
# Optional: change ports, session timeout, SSL/TLS
sudo vim /etc/wok/wok.conf
sudo systemctl daemon-reload
sudo systemctl start wokd
sudo systemctl enable wokd
```

The `wokd` service will fail if firewalld or SELinux are enabled, see it's [troubleshooting](https://github.com/kimchi-project/wok/blob/master/docs/troubleshooting.md) doc.

Configure a non privileged user to create and run VMs. This user doesn't need to use `sudo`.

```console
# Content of: /etc/polkit-1/localauthority/50-local.d/access.pkla
[Allow fred libvirt management permissions]
Identity=unix-user:<**your-user**>
Action=org.libvirt.unix.manage
ResultAny=yes
ResultInactive=yes
ResultActive=yes

# Place on .profile or .bashrc of the non privileged user:
export LIBVIRT_DEFAULT_URI=qemu:///system
```

Create at least one storage pool. Note that the directory should be writable by `qemu` user (to use the disk) and also your non privileged user (to create the disk).

```console
# Create /dir/of/storage/pool and fix it's owner and permission
export LIBVIRT_DEFAULT_URI=qemu:///system
virsh pool-define-as pool1 dir --target=/dir/of/storage/pool
virsh pool-build pool1
virsh pool-start pool1
virsh pool-autostart pool1
```

Download CoreOS image for qemu anywhere readable by your non privileged user:

```console
img=https://stable.release.core-os.net/amd64-usr/current/coreos_production_qemu_image.img.bz2
curl "$img" bzcat > coreos_qemu.img
```

Finally, try CoreOS Bootstrap. Change `192.168.1.10` below to the endpoint of the CoreOS Bootstrap service:

```console
bash <(curl 192.168.1.10:8080)
```

If updating an already created VM - change `192.168.1.10` below to the endpoint of the CoreOS Bootstrap service:

* Rerun `bash <(curl 192.168.1.10:8080)` on the host and `just [g]enerate cloud-config`
* `mv /tmp/to/new/configdrive.iso /path/to/pool/<**vm-name**>_configdrive.iso` - you should overwrite the old `configdrive.iso`
* If VM is not running, the new config will be applied on the next boot
* If VM is running:
  * `virsh attach-disk <**vm-name**> /path/to/pool/<**vm-name**>_configdrive.iso hda --type=cdrom`
  * Inside VM: `sudo coreos-cloudinit -from-file /media/configdrive/openstack/latest/user_data`

Some useful VM related libvirt commands:

* `virsh list [--all]`: list running VMs, or all VMs if `--all` is provided
* `virsh start <domain>`: start a VM
* `virsh autostart [--disable] <domain>`: autostart a VM when host is powered on, or turn off autostart if `--disable` is provided
* `virsh reboot <domain>`: gracefully reboot a VM
* `virsh shutdown <domain>`: gracefully power off a VM
* `virsh undefine <domain> [--remove-all-storage]`: remove a VM, and also it's disks if `--remove-all-storage` is provided

# Options

CoreOS Bootstrap has the following options:

* `-c, --config`: a mandatory option pointint to the directory of config, data and model
* `-e, --endpoint`: optional CoreOS Bootstrap service endpoint used by in-loco installation script, in order to save some typing
* `-l, --listen`: port to listen, default is `8080`

# Config files

Save parts of `cloud-config` in files named `<config-dir>/config-<name>.yaml`. Use as much config files as you need. All partial config names listed in the config array (`/api/config`) or a binding (`/api/bindings`) will be merged together in a single `cloud-config` output.

Valid `cloud-config` syntax should be used here, have a look at [config-core.yaml](sample/config-core.yaml) sample and the [CoreOS doc](https://coreos.com/os/docs/latest/cloud-config.html).

The final merged `cloud-config` will be rendered with [Mustache](http://mustache.github.io), so everything it's [JavaScript](https://github.com/janl/mustache.js) implementation supports, CoreOS Bootstrap should support as well. Let me know if you have problems.

Config files are not cached, so there is no need to restart the service after update the configuration.

# Data file

This is a key-value data file used to render `config-*.yaml` files to the final `cloud-config` output. Use as much `<config-dir>/data-<name>.yaml` as you need and list them in the data array (`/api/config`) or a binding (`/api/bindings`).

On name colision, the name declared on a data file listed later will overwrite that same name on a data file listed before.

Attributes may be missing, in this case the missing values should be provided when calling the api or running the installation script.

# Model file

The `<config-dir>/model.yaml` provide bindings between config names and data names as well as default values used by the installation script.

## Bindings

Bindings place together configs and datas under a single name. Use bindings declaring objects named with the name of the binding under the `bindings` object.

Creating a binding named `core` with two configs `config1` and `config2`, and one data `common`:

```console
bindings:
  core:
    config:
    - config1
    - config2
    data:
    - common
```

Install and missing (see below) can be declared per binding. Values of install and missing declared under bindings is merged with the global values. In the case of name colision, the local declaration overwrite the global one.

Install and missing syntax under a binding:

```console
bindings:
  core:
    config:
    - ...
    data:
    - ...
    install:
      <install-syntax>
    missing:
      <missing-syntax>
```

## Install

Provide params used to install CoreOS's Container Linux with `coreos-install`. Declare an object named `install` and the following attributes:

```console
install:
  device: "/dev/sda"
  image_mirror: "https://stable.release.core-os.net/amd64-usr"
  coreos_channel: "stable"
  coreos_version: "current"
```

These are the default values using the public mirror and the last stable version. Provide values of your own network here and save some bandwidth.

**Note:** Update Server and Channel must be provided inside the cloud-config file. The mirror, channel and version declared above are used in the installation process and nothing more.

## Missing

Missing is the place of some nice magic. Declare an object named `missing`, and under that object declare another objects named just like your missing attributes.

**Note:** missing attributes are attributes declared somewhere on your config files but not declared on your data files.

Something like this:

```console
missing:
  ipaddress:
    __some_var: 'some command'
    _some_prop: 'some value'
    _another_prop: '$__some_var'
  network_intf:
    __some_var: 'another command; and another one | grep stuff'
    _some_prop: '^($__some_var)$'
    _another_prop: '$ipaddress'
```

Some premisses to take in mind:

* Missings (`ipaddress` and `network_intf` above) are processed and queried to the sysadmin (installation script) in the same order they are declared
* Missings and the whole missing object are optional, all non declared missings will be queried after all listed ones
* All internal attributes are also optional
* If you want `some_missing` declared in a special order, just add a line with `some_missing:` in the right position
* User defined variables are prefixed with `__` (two underscores), will run as a Bash process, and it's stdout will be saved in an environment variable with the same name
* Parameters to the installation script are prefixed with `_` (one underscore) and will be [expanded](http://www.tldp.org/LDP/Bash-Beginners-Guide/html/sect_03_04.html#sect_03_04) before used, so it's valid to use any `$__user_defined` from the missing configuration, `$param_name` from data, or an already typed `$missing`
  * `_help`: a help message to the sysadmin
  * `_default`: default value of the missing
  * `_regex_validate`: valid regex with [extended](https://www.gnu.org/software/sed/manual/html_node/Extended-regexps.html) syntax to validate data

**Note:** Data values from `data-*.yaml` are also available as environment variables on `_install_param` and `__user_defined` internal attributes, however only variables matching `[A-Za-z_][A-Za-z0-9_]*` will be exported.

**Samples**

Build a list of network interfaces. The `__intf` var is reused on `_default` and `_regex_validate` attributes:

```console
missing:
  network_intf:
    __intf: 'cd /sys/class/net/; echo * | sed "s/ /|/g"'
    _default: '$__intf'
    _regex_validate: '^(${__intf})$'
```

Reuse the network interface and find an IP address. The `network_intf` missing is declared just to be queried to the sysadmin before `ipaddress`:

```console
missing:
  network_intf:
  ipaddress:
    __ip: 'ip a show dev $network_intf | egrep -o "inet [0-9.]+" | sed -n "1s/inet //p"'
    _default: '$__ip'
    _regex_validate: '^([0-9]{1,3}\.){3}[0-9]{1,3}$'
```

# Deploy

The simplest way to deploy CoreOS Bootstrap is using it's Docker image. Create `/var/lib/coreos-bootstrap/config` with configs, datas and model, and mount this directory inside the container.

This systemd unit has the most common configuration:

```console
[Unit]
Description=CoreOS Bootstrap
After=docker.service
Requires=docker.service
[Service]
ExecStartPre=-/usr/bin/docker stop coreos-bootstrap
ExecStartPre=-/usr/bin/docker rm coreos-bootstrap
ExecStart=/usr/bin/docker run \
  --name coreos-bootstrap \
  -p 8080:8080 \
  -v /var/lib/coreos-bootstrap/config:/var/lib/coreos-bootstrap/config:ro \
  quay.io/jcmoraisjr/coreos-bootstrap:latest \
    --config=/var/lib/coreos-bootstrap/config \
    --endpoint=192.168.1.10:8080
RestartSec=10s
Restart=always
[Install]
WantedBy=multi-user.target
```

# Wishlist

* Async calls
* Tests of web-facade
* Special meaning for `[]` and `{}` on installation script
* Allow usage of `&` and `<empty-space>` on missing attributes of installation script
* Provision with VirtualBox and VMware
* Use of `_default` and `_regex_validate` on install and provision
