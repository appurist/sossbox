# SOSSData
A simple online storage server.

<img src="public/logo.png" alt="SOSSData Server Logo" style="zoom:75%;" />

## NEW PROJECT
This is a new project under active development and changing frequently. Documentation for use is not yet available, but will be following soon.

It may be possible to use a SOSSData server for static hosting after looking at the `sossdata.cfg` file, however the routes of the REST API are not documented (but can be found in the `routes.js` file).

## SOSSDATA SERVER CONFIGURATION

Binary executables are attached to each release in [releases](https://github.com/appurist/sossdata/releases). You can customize the resulting server by copying `sossdata.example.cfg` to `sossdata.cfg` and tweaking the configuration settings as desired. By default, even without a configuration file, sossdata will start a server and accept connections, presenting the contents of a `public` folder if found, over HTTPS if `server.key` and `server.crt` files exist under an `ssl` subfolder. It will also respond to `/ping` and `/status` routes. And unless disabled using the `storage` option in `sossdata.cfg`, it will also accept logins and an authenticated REST API calls for /projects and /assets, storing both JSON and binary assets as files in the local file system (in a `data` subfolder, by default). It will also default to allowing new user registrations unless `registration` is disabled in the configuration file. See the [sossdata.example.cfg](https://github.com/appurist/sossdata/blob/master/sossdata.example.cfg) file for more.

## STARTING A NEW SERVER

To start a new server, simply run the `sossdata` server executable. There are no parameters or options, these are all configured in the `sossdata.cfg` file.

Standard environment variables can also be used for most of the configuration options, in particular these options and their defaults in parentheses: `PORT` (if present) or `SOSSDATA_PORT` (otherwise 443 or 80 depending on `ssl` subfolder), `SOSSDATA_HOST` ('0.0.0.0'), `SOSSDATA_PREFIX` (/), `SOSSDATA_PUBLIC` ('public'), `SOSSDATA_DATA` ('data'), `SOSSDATA_STORAGE` (true), `SOSSDATA_REGISTRATION` (true), `SOSSDATA_SECRET` ('secret'), `SOSSDATA_ID` ('sossdata'), `SOSSDATA_NAME` ('SOSSData Server').

The only *required* field is the `SOSSDATA_SECRET`, which is used to encode the JSON Web Token (JWT) tokens provided in response to a login request, but ideally you should also provide a custom `SOSSDATA_ID` (e.g. 'myserver') and `SOSSDATA_NAME` ("My Server").

When present in a `sossdata.cfg` file, the `SOSSDATA_` prefix in these identifiers must not be used (e.g. just provide `id`, `name` and `secret`).

## RUNNING AS A LINUX SERVICE

In the `support` subfolder, an `example.service` file is provided for running as a Linux systemd service, along with a simple `sossctl` script file that the service file uses.

## To build or run from source code:

To start the server without yarn:
```
node server.js
```

To initialize the development environment (dependencies):
```
yarn
```
To start the server (with yarn):
```
yarn start
```
