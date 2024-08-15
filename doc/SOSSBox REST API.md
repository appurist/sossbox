# SOSSData REST API

There are to classes of endpoint routes: those requiring authentication, and those that do not. There are also a few common object types passed to or returned by these REST endpoints. The most common is the user profile object type, but each of these is documented below.

## Common Object Types

#### User Profile
A user profile object has the following format:
`{ uid, login, display, email, administrator, image }`
These are:

| Field  | Description |
| ------ | ----------------------------- |
| `uid`  | Content Cell  |
| `login` | the text identifier used to login with, a.k.a. username or userid, e.g. 'jsmith' |
| `display` | text representing the display name of the user, e.g. 'John Smith' |
| `email`  | the email address of the user account |
| `administrator` | a boolean value, `true` if recognized as an administrator, `false` otherwise |
| `image` | user profile image, as an asset ID+extension, e.g. `1234.png` |

See the section on Assets below for more info on the `image` field.

The reply to the `/login` route is a bit of a special case, that adds a `token` field for use in `Authorization: Bearer` headers of subsequent requests:
`{ uid, login, display, email, administrator, image, token }`

## Unauthenticated Routes

#### GET /ping
Verifies server availability and type of server.

Response body:
`{ name, version }`
Server name (type), always `'sossdata'` for SOSSData servers, plus server version (same as in `/status` below.

#### GET /status
Returns information about this SOSSData site. A mix of info from the sossdata.cfg file and server status such as version number.

Response body:
`{ version, id, name, domain, registration, motd }`
Server version, site id, site name, site domain, boolean indicating whether user registrion is open, optional message of the day (as markdown text).

#### PUT /login
Request body:
`{ login, password }`
Response body:
`{ uid, login, display, email, administrator, image, token}`
Returns the user definition for the specified login name, as well as an authentication token.

________________

## Users and Profiles (authenticated):

#### POST /logout
Response body (see User Profile):
`{ message: 'You have been logged out.', result: 'OK' }`
Logs out the user.
_At this time, it actually does nothing at the server end other than validate the authentication token. Important for future server use._

#### GET /profile
Response body (see User Profile):
`{ uid, login, display, email, administrator, image}`
Returns the user definition for the current user.

#### PUT /profile
Request body:
`{ login, display, email, image }`
Fields are optional and represent updates if present.

Response body:
`{ uid, login, display, email, image, administrator }`
Returns the user definition for the current user after merging in the request body fields.

#### GET /users
_Note: Not implemented currently, and when it is it will be available only for administrators._

Response body:
`[ uuid1, uuid2, … ]`
Returns an array of user UUIDs.

#### GET /users/:loginName
_Note: Only implemented for the current user, when implemented, it will be admin only._

Response body:
`{ uid, login, display, email, administrator, image }`
Returns the user definition for the account specified by the login ID.

#### DELETE /users/:uid
Response body:
`{ uid, login, display, email, administrator, image }`
Deletes the user definition for the account specified by the login ID. Returns the former user def.

________________

### Projects (authenticated):

#### GET /projects
Retrieves a list of all projects (IDs).

Response body:
`[ uuid1, uuid2, … ]`
Returns an array of project UUIDs.

#### POST /projects
Creates a new project.

Request body:
`{ project definition, without a uid … }`
Response body:
`{ uid: new_uuid, project definition fields … }`
Assigns a UUID to a new project and stores it.

Note that the definition of a project is not specified; it depends on the project. The only known field is a `uid` and that the full definition may have UUIDs in some fields representing assets.

#### GET /projects/:id
Response body:
`{ project definition }`
Returns the definition for the project specified by the route ID.


#### PUT /projects:id
Updates an existing project.

Request body:
`{ project definition, without a uid … }`
Fields are optional and represent updates if present.

Response body:
`{ uid, all other project definition fields }`
Returns the full record for the project definition, including the uid, after merging updated fields.

#### DELETE /projects/:uid
Deletes a project.

Response body:
`{ project definition}`
Deletes the project specified by the uid in the route. Returns the former project def.
Note that this operation does **not** delete any dependent resources such as associated assets, since that requires knowlege of the project definition and which fields might represent dependents such as assets.
________________

### Assets (authenticated):

#### GET /assets?type=xyz
Response body:
`[ uuid1, uuid2, … ]`
Returns an array of available user assets, filtered by type (if specified).

#### POST /assets
Request body:
`{ asset metadata definition, required type, optional uid … }`
Response body:
`{ uid: new_asset_uuid, asset metadata fields … }`
Stores the metadata for an asset, optionally assigning a specific UUID to a new asset. Enables `POST` or `PUT` to an actual binary asset by ID (below), if the asset is not a JSON document.

#### PUT /assets/:id
Request body:
`{ partial or full json metadata fields for asset }`
Response body:
`{ updated asset metadata fields … }`
Updates the JSON metadata for an asset which has been previously defined via `POST /assets`. Use `POST` with ID to replace the full asset binary, `PUT` with ID to update the JSON metadata only.

#### POST /assets/:id
Request body:
`{ binary asset data }`
Response body:
`{ asset metadata fields … }`
Stores the actual binary data content for an asset which has been previously defined via `POST /assets`, thus of a known type. Use this `POST` with ID to set or replace the binary asset data itself; use `PUT` with ID to update the JSON metadata only.

#### GET /assets/:id
Response body:
`{ user project definition }`
Returns the definition for the project specified by the route ID.

#### DELETE /projects/:uid
Response body:
`{ project definition}`
Deletes the project specified by the uid in the route. Returns the former project def.
