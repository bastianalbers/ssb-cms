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
const pull = require('pull-stream')
const many = require('pull-many')

module.exports = function(ssb, drafts, root, cb) {
  let selection = observable.signal()

  selection( (el)=>{
    document.querySelectorAll('.selected').forEach( el => el.classList.remove('selected') )
    if (el) el.classList.add('selected')
  })

  function branches(root) {
    return function() {
      return pull(
         many([
          root && ref.type(root) ?
            ssb.links({
              rel: 'branch',
              dest: root,
              keys: true,
              values: true
            }) 
          : pull.empty(), // TODO: get all root messages
          drafts.byBranch(root)
        ])
      )
    }
  }

  function addChild(el, parentId) {
    let value = {
      content: {
        type: 'post'
      }
    }
    drafts.create(JSON.stringify(value,null,2), parentId, null, (err, key)=>{
      let ul = el.tagName === 'UL' ? el : el.querySelector('ul')
      ul.appendChild( h('li', render({key, value})) )
    })
  }

  function clone(el, id) {
    ssb.get(id, (err, value) => {
      if (err) throw err
      drafts.create(JSON.stringify(value,null,2), value.content.branch, value.content.revisionRoot, (err, key)=>{
        let ul = ancestorWithTagName('ul', el.parentElement)
        ul.appendChild( h('li', render({key, value})) )
      })
    })
  }

  function ancestorWithTagName(tag, el) {
    if (el.tagName === tag.toUpperCase()) return el
    return ancestorWithTagName(tag, el.parentElement)
  }

  function ancestorWithClass(cls, el) {
    if (el.classList.contains(cls)) return el
    return ancestorWithClass(cls, el.parentElement)
  }

  var render = ho(
    function(msg, kp) {
      if (!msg.key || !msg.value) return
      let v = msg.value
      if (typeof v === 'string') { // drafts might by unparsable json strings
        try { v = JSON.parse(v) } catch(e) {}
      } else if (!msg.value.content) return
      let t = (v.content && v.content.type) || 'Invalid'
      let value = { type: 'key-value', key: {type: 'msg-node', msg_type: t, id: msg.key}, value: branches(msg.key) }
      return this.call(this, value, kp)
    },

    function(msgNode, kp) {
      if (!msgNode.type || msgNode.type != 'msg-node') return
      kp = kp || []
      let id = msgNode.id
      let type = msgNode.msg_type
      return h('span.msgNode',
        h('span.type-key',
          this.call(this, type, kp.concat(['msg_type'])),
          this.call(this, id, kp.concat(['key']))
        ), 
        /^draft/.test(id) ? [] : h('span.buttons',
          h('button.add', 'add', {
            onclick: function() { addChild(ancestorWithClass('branch', this), id) }
          }),
          h('button.clone', 'clone', {
            onclick: function() { clone(ancestorWithClass('branch', this), id) }
          })
        )
      )
    },

    filter( value => h('a.node', {
      id: value,
      onclick: function(e)  {
        selection(this)
        e.preventDefault()
      }
    }, tag(8)(value.substr(0,8))), ref.type),

    filter( value => h('a.node.draft', {
      id: value,
      onclick: function(e)  {
        selection(this)
        e.preventDefault()
      }
    }, h('span', value.substr(0, 14))), (value) => /^draft/.test(value) ),
    tree(),
    source(),
    array(),
    properties(),
    kv(),
    ho.basic()
  )

  ssb.get(root, (err, value) => {
    if (err) return cb(err)
    let ul
    cb(null,
      h('.treeView',
        h('.addRoot',
          h('button', 'Create root node', {
            onclick: function() {
              addChild(ul, root)
            }
          })
        ),
        ul = render(branches(root))
      )
    )
  })

  render.selection = observable.transform( selection, el => el && el.id )
  render.branches = (root)=>branches(root)()
  return render
}

module.exports.css = ()=> tree.css() + `
  ul {
    list-style: none;
  }
  .treeView>ul {
    padding-left: 0px;
  }
  span.key {
    color: #222;
    font-weight: bold;
    margin-right: .2em;
  }
  .branch {
    white-space: nowrap;
  }
  .branch-header {
    display: flex;
    flex-wrap: nowrap;
  }
  .branch-header>span.key {
    flex-grow: 1;
    display: inline-flex;
    flex-wrap: nowrap;
  }

  .msgNode {
    flex-grow: 1;
    display: inline-flex;
    flex-wrap: nowrap;
    justify-content: space-between;
  }

  .branch-header .buttons {
    flex-grow: 1;
    display: inline-flex;
    flex-wrap: nowrap;
    justify-content: flex-end;
  }
  
  .branch>.branch-header button.add {
    display: none;
  }
  .branch.open>.branch-header button.add {
    display: inline-block;
  }

  .branch-header:hover {
    background: #ccc;
  }

  a.node {
    color: #dde;
    text-decoration: none;
    margin-left: .2em;
  }
  a.node.draft {
    color: red;
    font-style: italic;
  }
  a.node>span:hover {
    background-color: #226;
  }
  .node.selected>span {
    color: black;
    background: yellow;
  }
`
