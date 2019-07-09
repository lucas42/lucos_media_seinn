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
`nice -19 docker-compose up -d --no-build`

## Building
The build is configured to run in Dockerhub when a commit is pushed to the master branch in github.

## Media Manager
Use environment variable MEDIA_MANAGER to set baseurl of media manager.  Defaults to "https://ceol.l42.eu/".

## Etymology of name
*[lucOS](https://github.com/lucas42/lucos)* is a collection of systems designed to work together.  *Seinn* is the Irish word for play, in the musical sense.

