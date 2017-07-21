const pull = require('pull-stream')
const h = require('hyperscript')
const ho = require('hyperobj')
const observable = require('observable')

const u = require('hyperobj-tree/util')
const tree = require('hyperobj-tree/tree')
const properties = require('hyperobj-tree/properties')
const kv = require('hyperobj-tree/kv')
const source = require('hyperobj-tree/source')
const array = require('hyperobj-tree/array')
const filter = require('hyperobj-tree/filter')
const tag = require('hyperobj-tree/tag')

const ref = require('ssb-ref')

function messageTreeRenderer(ssb) {

  let selection = observable.signal()

  selection( (el)=>{
    document.querySelectorAll('.selected').forEach( el => el.classList.remove('selected') )
    if (el) el.classList.add('selected')
  })

  function branches(root) {
    return function() {
      return ssb.links({
        rel: 'branch',
        dest: root,
        keys: true,
        values: true
      })
    }
  }

  let render = ho(
    function(msg, kp) {
      if (!msg.key || !msg.value || !msg.value.content) return
      let value = { type: 'key-value', key: msg.key, value: branches(msg.key) }
      return this.call(this, value, kp)
    },
    filter( value => h('a.node', {
      id: value,
      onclick: function(e)  {
        selection(this)
        e.preventDefault()
      }
    }, tag(8)(value.substr(0,8))), ref.type),
    tree(),
    source(),
    array(),
    properties(),
    kv(),
    ho.basic()
  )

  render.selection = observable.transform( selection, el => el && el.id )
  return render
}

const ssbClient = require('ssb-client')
const ssbKeys = require('ssb-keys')
var keys = ssbKeys.loadOrCreateSync('mykeys')
// run `sbot ws.getAddress` to get this
const sbotAddress = "ws://localhost:8989~shs:nti4TWBH/WNZnfwEoSleF3bgagd63Z5yeEnmFIyq0KA="


ssbClient(keys, {
  keys,
  remote: sbotAddress,
  timers: {handshake: 30000},
  // TODO
  manifest: require('/Users/regular/.ssb/manifest.json')
}, function (err, ssb) {
  if (err) throw err

  const renderMessage = messageTreeRenderer(ssb)
  document.body.appendChild(h('span', 'Selection:', h('span.selection', renderMessage.selection)))

  let id = "%GKmZNjjB3voORbvg8Jm4Jy2r0tvJjH+uhV+cHtMVwSQ=.sha256"
  ssb.get(id, (err, value) => {
    if (err) throw err
    let el = renderMessage({key:id, value})
    document.body.appendChild(el)
  })
})


document.body.appendChild(h('h1', 'Hello Wolrd!'))
document.body.appendChild(h('style',tree.css()))
document.body.appendChild(h('style', `
  body {
    font-family: sans-serif;
    color: #444;
  }
  a.node {
    color: #dde;
    text-decoration: none;
  }
  a.node>span.tag:hover {
    background-color: #226;
  }
  ul {
    list-style: none;
  }
  span.key {
    color: #222;
    font-weight: bold;
    margin-right: .2em;
  }
  span.key::after {
    content: ':'
  }
  .branch>span.key::after {
    content: ''
  }
  .tag.color0 {
    background: #b58900;
  }
  .node.selected>.tag {
    background: yellow;
  }
  .tag.color1 {
    background: #cb4b16;
  }
  .tag.color2 {
    background: #dc322f;
  }
  .tag.color3 {
    background: #d33682;
  }
  .tag.color4 {
    background: #6c71c4;
  }
  .tag.color5 {
    background: #268bd2;
  }
  .tag.color6 {
    background: #2aa198;
  }
  .tag.color7 {
    background: #859900;
  }
`))
