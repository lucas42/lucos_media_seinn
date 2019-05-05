# Lucos Seinn
A media player for the lucos media system.

## Service-level dependencies
* [Lucos media manager](https://github.com/lucas42/lucos_media_manager)
* Access to media files provided to manager

## Server-side dependencies
* node.js
* npm

## Client-side dependencies
* promises
* fetch
* Web Audio API

## Running
`docker run -d -p 3001:8080 --name seinn lucas42/lucos_seinn`


## Media Manager
Use environment variable MEDIA_MANAGER to set baseurl of media manager.  Defaults to "https://ceol.l42.eu/".

## Etymology of name
*[lucOS](https://github.com/lucas42/lucos)* is a collection of systems designed to work together.  *Seinn* is the Irish word for play, in the musical sense.

