# SOSSBox
A simple online storage server.

<img src="public/logo.png" alt="SOSSBox Server Logo" style="zoom:75%;" />

## NEW PROJECT
This is a new project under active development and changing frequently. Documentation for use is not yet available, but will be following soon. 

It may be possible to use a SOSSBox server for static hosting after looking at the `sossbox.cfg` file, however the routes of the REST API are not documented (but can be found in the `routes.js` file).

## SOSSBOX SERVER CONFIGURATION

Binary executables are attached to each release in [releases](https://github.com/appurist/sossbox/releases). You can customize the resulting server by copying `sossbox.example.cfg` to `sossbox.cfg` and tweaking the configuration settings as desired. By default, even without a configuration file, sossbox will start a server and accept connections, presenting the contents of a `public` folder if found, over HTTPS if `server.key` and `server.crt` files exist under an `ssl` subfolder. It will also respond to `/ping` and `/status` routes. And unless disabled using the `storage` option in `sossbox.cfg`, it will also accept logins and an authenticated REST API calls for /projects and /assets, storing both JSON and binary assets as files in the local file system (in a `data` subfolder, by default). It will also default to allowing new user registrations unless `registration` is disabled in the configuration file. See the [sossbox.example.cfg](https://github.com/appurist/sossbox/blob/master/sossbox.example.cfg) file for more.

## STARTING A NEW SERVER

To start a new server, simply run the `sossbox` server executable. There are no parameters or options, these are all configured in the `sossbox.cfg` file.

Standard environment variables can also be used for most of the configuration options, in particular these options and their defaults in parentheses: `PORT` (if present) or `SOSSBOX_PORT` (otherwise 443 or 80 depending on `ssl` subfolder), `SOSSBOX_HOST` ('0'0'0'0), `SOSSBOX_PREFIX` (/), `SOSSBOX_PUBLIC` ('public'), `SOSSBOX_DATA` ('data'), `SOSSBOX_STORAGE` (true), `SOSSBOX_REGISTRATION` (true), `SOSSBOX_SECRET` ('secret'), `SOSSBOX_ID` ('sossbox'), `SOSSBOX_NAME` ('SOSSBox Server').
    
The only *required* field is the `SOSSBOX_SECRET`, which is used to encode the JSON Web Token (JWT) tokens provided in response to a login request, but ideally you should also provide a custom `SOSSBOX_ID` (e.g. 'myserver') and `SOSSBOX_NAME` ("My Server").

When present in a `sossbox.cfg` file, the `SOSSBOX_` prefix in these identifiers must not be used (e.g. just provide `id`, `name` and `secret`).

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
