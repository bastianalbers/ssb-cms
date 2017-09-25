const h = require('mutant/html-element')
const Value = require('mutant/value')
const computed = require('mutant/computed')
const when = require('mutant/when')
const ho = require('hyperobj')
const Menubar = require('./menubar')

// we expect the value to have properties conforming to
// ISO language codes (2 letters), e.g:
// {
//    en: "Hello World",
//    fr: "Bonjour le monde",
//    de: "Hallo Welt"
// }

module.exports = function(ssb, opts) {
  opts = opts || {}
  const transform = opts.transform || function (x) {return x}
  const tag = opts.tag || 'div.text'

  return function render(value, kp) {
    console.log('TEXT render', value)
    if (!value) return console.error('rendering null')
    const docLang = document.getElementsByTagName('html')[0].getAttribute('lang')
    const defaultLang = docLang || opts.defaultLanguage || 'en'
    let lang = opts.langObservable || Value(defaultLang)

    if (opts.languages) {
      opts.languages.forEach( (l)=> {
        if (!value[l]) value[l] = opts.defaultText || 'n/a'
      })
    }

    let localizedText = computed([lang], lang => {
     return value[lang] || opts.defaultText || 'n/a' 
    })
    let transformedText = computed([localizedText], transform)

    let el = h(tag, {
      'ev-click': e => {
        if (e.altKey) {
          makeEditable()
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }, 
      transformedText
    )
    let editable = false
    let unsubscribe

    function makeEditable() {
      if (editable) return
      editable = true
      el.innerText = localizedText()
      el.contentEditable = true
      el.focus()
      let width = el.offsetWidth
      if (width<300) width = 300
      let x = el.offsetLeft
      let langs = opts.languages
      let menu = ho(
        Menubar({renderItem: value => h('span', value) })
      )({
        type: 'menubar',
        left: langs.map((l)=>{ return { key: l, value: l } }),
        right: [{key: 'close', value: 'Done'}]
      })
      menu.style.position='absolute'
      menu.style.left = `${x}px`
      menu.style.width = `${width}px`
      el.parentElement.appendChild(menu)
      let menuHeight = menu.offsetHeight
      reposition()
      menu.activate(lang())

      el.addEventListener('keyup', reposition)
          
      function reposition() {
        let height = el.offsetHeight
        let y = el.offsetTop
        let p = y - menuHeight - 8
        if (p<0) p = y + height + 8;
        menu.style.top = `${p}px`
      }

      let closeEditor = function() {
        if (!editable) return
        unsubscribe()
        el.removeEventListener('keyup', reposition)
        menu.parentElement.removeChild(menu)
        menu = null
        lang = defaultLang
        el.innerHTML = transform(localizedText())
        el.contentEditable = false
        editable = false
      }

      unsubscribe = menu.activeItem( (item)=>{
        value[lang()] = el.innerText
        ssb.cms.update([...kp, lang()], value[lang()])
        let key = item.getAttribute('data-key')
        if (key === 'close') return closeEditor()
        lang.set(key)
        el.innerText = value[lang()]
        reposition()
      })
    }

    return el
  }
}

/*
document.body.appendChild(module.exports({
  //transform: md
  tag: 'h1'
})({
  en: "# Hello World",
  fr: "# Bonjour le monde",
  de: "# Hallo Welt"
}))

document.body.appendChild(h('style', `
  .text {
    border: 1px solid #333;
    width: 300px;
  }
  .menu-item.active {
    background: blue;
  }
` + renderMenu.css()))
*/
