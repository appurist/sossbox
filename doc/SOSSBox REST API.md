# SOSSBox REST API

### Unauthenticated:

#### GET /status
Response body: 

`{ version, id, name, domain, motd }`
Server version, main site id, main site name, main site domain, optional message of the day.

#### PUT /login
Request body: 
`{ login, password }`
Response body: 
`{ user: user_profile, token: auth_token, motd: markdown_message}`
Returns the user definition for the specified.

________________


### Users and Profiles (authenticated):

##### GET /profile
Response body: 
`{ user profile }`
Returns the user definition for the current user.

#### PUT /profile
Request body: 
`{ user profile fields }`
Response body: 
`{ user profile }`
Returns the user definition for the current user after merging in the request body fields.

#### GET /users
Response body: 
`[ uuid1, uuid2, … ]`
Returns an array of user UUIDs.

#### GET /users/:loginName
Response body: 
`{ user profile }`
Returns the user definition for the account specified by the login ID.

#### DELETE /users/:uid
Response body: 
`{ user profile }`
Deletes the user definition for the account specified by the login ID. Returns the former user def.

#### POST /logout
Response body: 
`{ message: 'You have been logged out.', result: 'OK' }`
Logs out the user (actually does nothing at the server end, at this time. For future use.



________________

### Projects (authenticated):

#### GET /projects
Response body: 
`[ uuid1, uuid2, … ]`
Returns an array of project UUIDs.

#### POST /projects
Request body: 
`{ project definition, without a uid … }`
Response body: 
`{ uid: new_uuid, project fields … }`
Assigns a UUID to a new project and stores it.

#### PUT /projects
Request body: 
`[ uuid1, uuid2, … ]`
Response body: 
`[ uuid1, uuid2, … ]`
Stores (and returns) a persistent recent list of projects (using an ordered array of project UUIDs).

#### GET /projects/:id
Response body: 
`{ user project definition }`
Returns the definition for the project specified by the route ID.

#### DELETE /projects/:uid
Response body: 
`{ project definition}`
Deletes the project specified by the uid in the route. Returns the former project def.
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
Stores the metadata for an asset, optionally assigning a UUID to a new asset. Enables `POST` or `PUT` to an actual binary asset by ID (below), if the asset is not a JSON document.

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

#### GET /projects/:id
Response body: 
`{ user project definition }`
Returns the definition for the project specified by the route ID.

#### DELETE /projects/:uid
Response body: 
`{ project definition}`
Deletes the project specified by the uid in the route. Returns the former project def.
