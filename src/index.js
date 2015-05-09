const exec = require('child_process').exec
const semver = require('semver')
const jf = require('jsonfile')
const path = require('path')
const os = require('os')
const auto_updater = require('auto-updater')
const finalhandler = require('finalhandler')
const http = require('http')
const serveStatic = require('serve-static')

export class Update {

  constructor (gh, app, cb) {
    this.repo = gh.repo
    this.repoUrl = 'git@github.com:' + gh.repo + '.git'
    this.storage = app.getPath('userData')
    this.currentVersion = app.getVersion()

    cb(auto_updater)
  }

  /**
   * Get tags from this.repo
   */
  _getTags (cb) {
    var self = this

    // Clone repo
    exec('git clone ' + this.repoUrl, {cwd: this.storage}, function (err, stdout, stderr) {
      if (err) {
        cb(new Error('Failed to clone repo.'), null)
        return
      }

      // Get latest tags
      exec('git tag', {cwd: path.join(self.storage, self.repo.split('/').pop())}, function (err, stdout, stderr) {
        if (err) {
          cb(new Error('Unable to get version tags.'), null)
          return
        }
        var tags = stdout.split('\n')
        tags.pop()
        cb(err, tags)
      })
    })
  }

  /**
   * Get current version from app.
   */
  _getCurrentVersion () {
    return this.currentVersion
  }

  /**
   * Local webserver to serve download url.
   */
  _localServer (cb) {
    let serve = serveStatic(path.join(this.storage, 'gh_releases'))

    // Create server
    let server = http.createServer(function (req, res) {
      let done = finalhandler(req, res)
      serve(req, res, done)
    })

    // Listen
    server.listen(0)

    server.on('listening', function () {
      cb(server.address().port)
    })
  }

  /**
   * Check for updates.
   */
  check (cb) {
    var self = this
    // 1. Get latest released version from Github.
    this._getTags(function (err, tags) {
      if (err) {
        cb(new Error(err), false)
        return
      }

      if (!tags) {
        cb(null, false)
        return
      }

      // Get the latest version
      let current = self._getCurrentVersion()

      // Get latest tag
      // @TODO: Sort the tags!
      let latest = tags.pop()
      if (!latest || !semver.valid(semver.clean(latest))) {
        cb(new Error('Could not find a valid release tag.'))
        return
      }

      // 2. Compare with current version.
      if (semver.lt(latest, current)) {
        cb(null, false)
        return
      }

      // There is a new version!

      // 3. Get .zip URL from Github release.
      let platform = os.platform()
      let arch = os.arch()
      let filename = self.repo.split('/').pop() + '-' + latest + '-' + platform + '-' + arch + '.zip'
      let zipUrl = 'https://github.com/' + self.repo + '/releases/download/' + latest + '/' + filename

      // 4. Create local json file with .zip URL.
      let localFile = path.join(self.storage, 'gh_releases/gh_updates.json')
      let localFileObj = {url: zipUrl}
      jf.writeFile(localFile, localFileObj, function (err) {
        if (err) {
          cb(new Error('Unable to save local update file.'), false)
          return
        }

        // 5. Setup temp local webserver to serve the feedurl
        self._localServer(function (port) {
          let localUrl = 'http://127.0.0.1:' + port + localFile
          auto_updater.setFeedUrl(localUrl)
          cb(null, true)
        })
      })
    })
  }

  /**
   * Download latest release.
   */
  download () {
    // Run auto_updater
    // Lets do this. :o
    auto_updater.checkForUpdates()
  }
}
