require('setimmediate')
const h = require('mutant/html-element')
const Value = require('mutant/value')
const MutantArray = require('mutant/array')
const MutantMap = require('mutant/map')
const computed = require('mutant/computed')
const when = require('mutant/when')
const send = require('mutant/send')

const pull = require('pull-stream')
const htime = require('human-time')
const ssbAvatar = require('ssb-avatar')
const memo = require('asyncmemo')
const lru = require('hashlru')

const {isDraft, arr} = require('./util')
const SortStream = require('./sort-stream')

module.exports = function(ssb, drafts, me, blobsRoot) {

  let getAvatar = memo({cache: lru(50)}, function (id, cb) {
    ssbAvatar(ssb, me, id, (err, about)=>{
      if (err) return cb(err)
      let name = about.name
      if (!/^@/.test(name)) name = '@' + name
      let imageUrl = `${blobsRoot}/${about.image}`
      cb(null, {name, imageUrl})
    })
  })

  let selection = Value()
  let root = Value()
  let currRoot = null
  let ready = Value(false)

  function discardDraft(node) {
    drafts.remove(node.id, (err)=>{
      if (err) throw err
      let hash = document.location.hash
      if (hash.indexOf(':') !== -1) {
        document.location.hash = hash.split(':')[0]
      }
      selection.set('latest')
    })
  }

  function html(entry) {

    function _click(handler, args) {
      return { 'ev-click': send( e => handler.apply(e, args) ) }
    }

    let feedId = isDraft(entry.id) ? me : entry.value.author
    let authorAvatarUrl = Value(null, {defaultValue: ""})
    let authorName = Value(null, {defaultValue: feedId})
    getAvatar(feedId, (err, avatar) =>{
      if (err) return console.error(err)
      authorAvatarUrl.set(avatar.imageUrl)
      authorName.set(avatar.name)
    })

    return h('div', {
      classList: computed([selection, isDraft(entry.id)], (sel, draft) => {
        console.log('sel', sel)
        let cl = ['rev']
        if (sel === entry.id) cl.push('selected')
        if (draft) cl.push('draft')
        return cl
      })
    }, [
      h('img.avatar', {src: authorAvatarUrl}),
      h('span.author', authorName),
      h('span.timestamp', htime(new Date(entry.value.timestamp))),
      h('a.node', {
        href: `#${root()}:${entry.id}`
      },entry.id.substr(0,8)),
      when(isDraft(entry.id), h('span', {title: 'draft'}, '✎')),
      // TODO when(entry.forked, h('span', {title: 'conflicting updates, plese merge'}, '⑃')),
      h('span.buttons', [
        when(isDraft(entry.id), h('button.discard', _click(discardDraft, [entry]), 'discard' ))
      ])
    ])
  }

  let sortStream = SortStream(ssb, drafts)
  let mutantArray = MutantArray()

  function streamRevisions(id, syncCb) {
    console.log('streaming sorted revisions of', id)
    let drain
    let entries
    let synced = false
    pull(
      sortStream(id),
      drain = pull.drain( _entries =>{
        if (_entries.sync) {
          synced = true
          mutantArray.set(entries)
          return syncCb(null, entries)
        }
        entries = _entries
        if (synced) {
          mutantArray.set(entries)
        }
      }, (err)=>{
        if (err) throw err
        console.log('stream ended', err)
      })
    )
    return drain.abort
  }

  let containerEl = h('.revs', MutantMap(mutantArray, html))
  let abort

  selection( id => {
    if (id === 'latest') {
      if (mutantArray.getLength() > 0) {
        return selection.set(mutantArray.get(mutantArray.getLength()-1).id)
      }
      selection.set(null)
    }
    console.log('rev selected', id)
  })

  root( id => {
    if (currRoot === id) {
      ready.set(true)
      return
    }
    console.log('NEW rev root', id)
    currRoot = id
    if (abort) abort()
    abort = null
    selection.set(null)
    ready.set(false)
    entries = []
    mutantArray.clear()
    if (!id) return

    abort = streamRevisions(id, (err, entries)=>{
      if (err) throw err
      console.log('revisions synced')
      ready.set(true)
    })
  })

  containerEl.selection = selection
  containerEl.root = root
  containerEl.ready = ready

  return containerEl
}

module.exports.css = ()=> `
  .rev {
    font-size: 11px;
    color: #6b6969;
    background-color: #eee;
    margin: 1px 1px 0 1px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-wrap: wrap;
    max-height: 32px;
    align-content: flex-start;
  }
  .rev.selected {
    color: #111110;
    background: #b39254;
  }
  .rev .node {
    order: 3;
    margin: 8px 32px;
    color: #6b6969;
  }
  .rev img {
    margin: 0 8px;
    max-height: 32px;
  }
  .rev .author, .rev .timestamp {
    width: 80px;
  }
`
