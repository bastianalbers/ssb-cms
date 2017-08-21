const ref = require('ssb-ref')
const pull = require('pull-stream')
const many = require('pull-many')
const ssbSort = require('ssb-sort')
const deepAssign = require('deep-assign')

function filterRevisions() {
  // return only latest revisions
  return function (read) {
    var queue, _err, _cb
    var heads = {}, roots = {}
    var drain = pull.drain(function (msg) {
      let c = msg.value.content
      var revisionBranch = msg.value.revisionBranch || (c && c.revisionBranch)
      if (revisionBranch) {
        if (heads[revisionBranch]) delete heads[revisionBranch]
        else roots[revisionBranch] = true
      }
      if (roots[msg.key]) delete roots[msg.key]
      else heads[msg.key] = msg
    }, function (_err) {
      queue = ssbSort(Object.keys(heads).map(key => heads[key]))
      if (_cb) {
        let cb = _cb
        _cb = null
        if (_err) cb(_err)
        else if (queue.length) cb(null, queue.shift())
        else cb(true)
      } else {
        _err = err
      }
    })(read)
    return function (abort, cb) {
      if (abort) {
        if (drain) {
          let _drain = drain
          drain = null
          return _drain.abort(abort, cb)
        }
        return read(abort, cb)
      }
      if (_err) cb(_err)
      else if (!queue) _cb = cb
      else if (queue.length) return cb(null, queue.shift())
      else cb(true)
    }
  }
}
module.exports = function(ssb, drafts) {
  
  // get latest revision of given revisionRoot
  // (including drafts)
  function getLatest(key, cb) {
    if (!key) return cb(new Error('no key specified'))
    pull(
      many([
        pull(
          pull.once(key),
          pull.asyncMap(ssb.get),
          pull.map( x=>{return {key, value: x}})
        ),
        ssb.links({
          rel: 'revisionRoot',
          dest: key,
          keys: true,
          values: true
        }),
        drafts.byRevisionRoot(key)
      ]),
      filterRevisions(),
      pull.collect( (err, results)=>{
        if (err) return cb(err)
        if (results.length !== 1) return cb(new Error('got more or less than one result'))
        let msg = results[0].value
        if (msg.msgString) {
          try{
            msg = JSON.parse(msg.msgString)
          } catch(e) {
            e.msgString = msg.msgString
            return cb(e)
          }
        }
        cb(null, msg)
      })
    )
  }

  function branches(root) {
    return function() {
      return pull(
         many([
          root && ref.type(root) ? pull(
            ssb.links({
              rel: 'branch',
              dest: root,
              keys: true,
              values: true
            }),
            pull.unique('key')
          ) : pull.empty(),
          drafts.byBranch(root)
        ]),
        filterRevisions()
      )
    }
  }

  function getPrototypeChain(key, result, cb) {
    getLatest(key, (err, msg)=>{
      if (err) return cb(err)
      result.unshift(msg)
      let p
      if (p = msg.content.prototype) {
        if (result.indexOf(p) !== -1) return cb(new Error('Cyclic prototype chain'))
        return getPrototypeChain(p, result, cb)
      }
      cb(null, result)
    })
  }

  function getReduced(key, cb) {
    getPrototypeChain(key, [{}], (err, chain)=>{
      if (err) return cb(err)
      cb(null, deepAssign.apply(null, chain))
    })
  }
  
  return {
    getLatest,
    getPrototypeChain: function (key, cb) {getPrototypeChain(key, [], cb)},
    getReduced,
    branches
  }
}
