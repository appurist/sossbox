# SOSSData SSL (HTTPS) Configuration
To have the SOSSData server automatically recognize an SSL certificate and being listening on an HTTPS route instead, simply copy the certificate to the `ssl` subfolder as `server.key` and the private key file as `server.key`.

So you should end up with:

```
ssl/
  server.key
  server.crt
```

Rename your file to use those file names and the server will automatically recognize and use them with no configuration necessary.

In the SOSSData root folder, these files would refer to the serving of the `public` folder.
