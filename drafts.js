const levelup = require('levelup')
const pl = require('pull-level')
const pull = require('pull-stream')
const crypto = require('crypto')

module.exports = function () {
  const db = levelup('drafts', {
    db: require('level-js'),
    valueEncoding: 'json'
  })
  return {
    get: (key, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        cb(null, value.content)
      })
    },
    update: (key, content, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        value.content = content
        db.put(key, value, cb)
      })
    },
    remove: (key, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        let {branch, revisionRoot} = value
        pull(
          pull.values([{
            type: 'del',
            key: key,
          }, {
            type: 'del',
            key: `~BRANCH~${branch || ''}~${key}`,
          }, {
            type: 'del',
            key: `~REVROOT~${revisionRoot || ''}~${key}`,
          }]),
          pl.write(db, cb)
        )
      })
    },
    create: function(content, branch, revisionRoot, cb) {
      const key = 'draft-' + crypto.randomBytes(16).toString('base64')
      pull(
        pull.values([{
          type: 'put',
          key: key,
          value: {
            revisionRoot,
            branch,
            content
          }
        }, {
          type: 'put',
          key: `~BRANCH~${branch || ''}~${key}`,
          value: key
        }, {
          type: 'put',
          key: `~REVROOT~${revisionRoot || ''}~${key}`,
          value: key
        }]),
        pl.write(db, (err)=>{
          cb(err, key)
        })
      )
    },
    publish: (ssb, key, cb) => {
      db.get(key, (err, value) => {
        if (err) return cb(err)
        let msg
        try {
          msg = JSON.parse(value.content)
        } catch(e) {
          return cb(e)
        }
        if (!msg.content) return cb(new Error('message has no content'))
        // NOTE: we ignore everything but the msg.content and overwrite
        // branch and revisionRoot!
        if (value.branch) msg.content.branch = value.branch
        if (value.revisionRoot) msg.content.revisionRoot = value.revisionRoot
        ssb.publish(msg.content, cb)
      })
    },

    byBranch: function(branch) {
      return pull(
        pl.read(db, {min: `~BRANCH~${branch||""}`, max: `~BRANCH~${branch||""}~~`}),
        pull.asyncMap(function (e, cb) {
          db.get(e.value, function (err, value) {
            if (err) return cb(err)
            cb(null, {key: e.value, value: value.content})
          })
        })
      )
    }
  
  }
}
