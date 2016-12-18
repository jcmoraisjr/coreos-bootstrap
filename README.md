#CoreOS Bootstrap

CoreOS's Container Linux bootstrap engine.

CoreOS Bootstrap merges partial configuration files, apply predefined or on demand data, and generates complete [cloud-config](https://coreos.com/os/docs/latest/cloud-config.html) file for CoreOS's Container Linux hosts.

Configuration render uses [{{Mustache}}](http://mustache.github.io) templates, so everything it's [JavaScript](https://github.com/janl/mustache.js) implementation supports, CoreOS Bootstrap should support as well.

CoreOS Bootstrap also provides a simple-to-use in-place installation script.

[![Docker Repository on Quay](https://quay.io/repository/jcmoraisjr/coreos-bootstrap/status "Docker Repository on Quay")](https://quay.io/repository/jcmoraisjr/coreos-bootstrap)

#Usage

Running with Node.js:

    npm install ## Only in the first time
    make node-run

Running as a Docker container - you should copy `sample` directory if using Docker in a VM, like Docker Machine:

    make container-run

Both Node.js and Docker samples above uses `sample` config directory. A config directory has:

* `config-*.yaml`: partial cloud-config files and `{{mustache}}` tags
* `data-*.yaml`: data used to populate Mustache tags
* `model.yaml`: config+data bindings as well as default values for the installation script

Running tests:

    npm install ## Only in the first time
    npm test

##Generate a cloud-config

Create a `user_data` file (see `sample/config-core.yaml` and `sample/data-common.yaml`). POST config, data and missing properties as a JSON object to `/api/config`:

    curl \
        -H 'Content-Type: application/json' \
        -d '{
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

GET the same `user_data` file using a binding (see `sample/model.yaml`):

    curl -o user_data '127.0.0.1:8080/api/bindings/core?network_intf=eth0&ipaddress=192.168.1.10&ipmask=24&gateway=192.168.1.1'

Manual provided properties, like `ipaddress` or `gateway` above, will override properties with the same name provided from data.

##Installation script

Start the installation script from a CoreOS host running the CoreOS [ISO image](https://stable.release.core-os.net/amd64-usr/current/coreos_production_iso_image.iso).

##Assign a public IP address

The installation script need to connect the CoreOS Bootstrap. If you have connectivity, jump to *Running the installation script* below.

But if you don't have a DHCP server or if for some reason your public network interface doesn't have a valid IP address (check with `ip a`), you cannot access the CoreOS Bootstrap service. If so, follow this steps:

Check the name of your public network interface:

    ls /sys/class/net

Change, below, `eth0` to the name of your public network interface, `192.168.1.11` to an IP address of your network, `24` to the network mask, `8.8.8.8` to your DNS (if you have one), and finally `192.168.1.1` to your gateway. Place the resulting content at `/etc/systemd/network/00-en.network`.

    [Match]
    Name=eth0
    [Network]
    Address=192.168.1.11/24
    DNS=8.8.8.8
    Gateway=192.168.1.1

Restart the network service:

    sudo systemctl restart systemd-networkd

Now `ip a` should list your public IP address. So let's configure CoreOS.

##Running the installation script

Change `192.168.1.10:8080` below to the endpoint of your CoreOS Bootstrap service:

    bash <(curl 192.168.1.10:8080)

... and follow the script. The installation process should take some time to download the CoreOS image. Tip: create a [mirror](https://stable.release.core-os.net/amd64-usr/) on your network, update `sample/model.yaml` and save some bandwidth.

After the installation process and the reboot, ssh to the CoreOS host. Change `192.168.1.11` below to it's public IP address:

    ssh -i sample/id_rsa core@192.168.1.11

#Options

CoreOS Bootstrap has the following options:

* `-c, --config`: a mandatory option pointint to the directory of config, data and model
* `-e, --endpoint`: optional CoreOS Bootstrap service endpoint used by in-loco installation script, in order to save some typing
* `-l, --listen`: port to listen, default is `8080`

#Config file

Save parts of `cloud-config` in files named `<config-dir>/config-<name>.yaml`. Use as much config files as you need. All partial config names listed in the config array (`/api/config`) or a binding (`/api/bindings`) will be merged together in a single `cloud-config` output.

Valid `cloud-config` syntax should be used here, have a look at [config-core.yaml](sample/config-core.yaml) sample and the [CoreOS doc](https://coreos.com/os/docs/latest/cloud-config.html).

The final merged `cloud-config` will be rendered with [Mustache](http://mustache.github.io), so everything it's [JavaScript](https://github.com/janl/mustache.js) implementation supports, CoreOS Bootstrap should support as well. Let me know if you have problems.

#Data file

This key-value data file used to render `cloud-config` to the final output. Save as much `<config-dir>/data-<name>.yaml` as you need and list them in the data array (`/api/config`) or a binding (`/api/bindings`).

On name colision, the name declared on a data file listed later will overwrite that same name on a data file listed before.

Attributes may be missing, in this case the missing values should be provided when calling the api or running the installation script.

#Model file

The `<config-dir>/model.yaml` provide bindings between config names and data names as well as default values used by the installation script.

##Bindings

Bindings place together configs and datas under a single name. Use bindings declaring objects named with the name of the binding under the `bindings` object.

Creating a binding named `core` with two configs `config1` and `config2`, and one data `common`:

    bindings:
      core:
        config:
        - config1
        - config2
        data:
        - common

Install and missing (see below) can be declared per binding. Values of install and missing declared under bindings is merged with the global values. In the case of name colision, the local declaration overwrite the global one.

Install and missing syntax under a binding:

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

##Install

Provide params used to install CoreOS's Container Linux with `coreos-install`. Declare an object named `install` and the following attributes:

    install:
      device: "/dev/sda"
      image_mirror: "https://stable.release.core-os.net/amd64-usr"
      coreos_channel: "stable"
      coreos_version: "current"

These are the default values using the public mirror and the last stable version. Provide values of your own network here and save some bandwidth.

**Note:** Update Server and Channel must be provided inside the cloud-config file. The mirror, channel and version declared above are used in the installation process and nothing more.

##Missing

Missing is the place of some nice magic. Declare an object named `missing`, and under that object declare another objects named just like your missing attributes.

**Note:** missing attributes are attributes declared somewhere on your config files but not declared on your data files.

Something like this:

    missing:
      ipaddress:
        __some_var: 'some command'
        _some_prop: 'some value'
        _another_prop: '$__some_var'
      network_intf:
        __some_var: 'another command; and another one | grep stuff'
        _some_prop: '^($__some_var)$'
        _another_prop: '$ipaddress'

Some premisses to take in mind:

* Missings (`ipaddress` and `network_intf` above) are processed and queried to the sysadmin (installation script) in the same order they are declared
* Missings and the whole missing object are optional, all non declared missings will be queried after all listed ones
* All internal attributes are also optional
* If you want `some_missing` declared in a special order, just add a line with `some_missing:` in the right position
* User defined variables are prefixed with `__` (two underscores), will run as a Bash process, and it's stdout will be saved in an environment variable with the same name
* Parameters to the installation script are prefixed with `_` (one underscore) and will be expanded before used, so it's valid to use any `$env_var` here
    * `_default`: default value of the missing
    * `_regex_validate`: valid regex with extended syntax to validate data using `egrep`

**Samples**

Build a list of network interfaces. The `__intf` var is reused on `_default` and `_regex_validate` attributes:

    missing:
      network_intf:
        __intf: 'cd /sys/class/net/; echo * | sed "s/ /|/g"'
        _default: '$__intf'
        _regex_validate: '^(${__intf})$'

Reuse the network interface and find an IP address. The `network_intf` missing is declared just to be queried to the sysadmin before `ipaddress`:

    missing:
      network_intf:
      ipaddress:
        __ip: 'ip a show dev $network_intf | egrep -o "inet [0-9.]+" | sed -n "1s/inet //p"'
        _default: '$__ip'
        _regex_validate: '^([0-9]{1,3}\.){3}[0-9]{1,3}$'

#Deploy

The simplest way to deploy CoreOS Bootstrap is using it's Docker image. Create `/var/lib/coreos-bootstrap/config` with configs, datas and model, and mount this directory inside the container.

This systemd unit has the most common configuration:

    [Unit]
    Description=CoreOS Bootstrap
    After=docker.service
    Requires=docker.service
    [Service]
    ExecStartPre=-/usr/bin/docker stop coreos-bootstrap
    ExecStartPre=-/usr/bin/docker rm coreos-bootstrap
    ExecStartPre=/usr/bin/mkdir -p /var/lib/coreos-bootstrap/config
    ExecStart=/usr/bin/docker run \
      --name coreos-bootstrap \
      -p 8080:8080 \
      -v /var/lib/coreos-bootstrap/config:/var/lib/coreos-bootstrap/config \
      quay.io/jcmoraisjr/coreos-bootstrap:latest \
        --config=/var/lib/coreos-bootstrap/config \
        --endpoint=192.168.1.10:8080
    RestartSec=10s
    Restart=always
    [Install]
    WantedBy=multi-user.target

#Wishlist

* Async calls
* Tests of web-facade
* Special meaning for `[]` and `{}` on installation script
* Allow usage of `&` and `<empty-space>` on missing attributes of installation script
