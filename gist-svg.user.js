// ==UserScript==
// @name          inline SVG images at github and gist.github.com
// @namespace     http://github.com/johan/
// @description   When viewing SVG gists, show the image instead of its source code, by default, and links to switch between the two
// @include       https://gist.github.com/*
// @include       https://github.com/*/blob/*.svg
// @match         https://gist.github.com/*
// @match         https://github.com/*/blob/*.svg
// @version       1.2
// ==/UserScript==

(function exit_sandbox() { // see end of file for unsandboxing code
  var is_gist = 'gist.github.com' === location.hostname
   // sel_svg is the context node for all the selectors
    , sel_svg = is_gist ? '#files .file[id$=".svg"]'
                        : '[data-path$=".svg/"] + .frames .file'
    , sel_box = '.data'
    , sel_raw = '.data > table td[width="100%"]'
    , sel_num = '.data > table td:not([width="100%"])'
    , sel_hdr = '.meta .actions'
    , A       = tag('a')
    ;

function init() {
  $(sel_svg).each(function inline_image_and_add_header_links(n, all) {
    var me = this // jQuery doesn't pass it in arg 1, as forEach would
      , th = $(sel_hdr, me)
      , td = $(sel_raw, me)
      , tw = $(sel_box, me).width()
      , ai = A({ href: '#', click: show_as_image }, 'image/svg')
      , at = A({ href: '#', click: show_as_text }, 'text/plain')
      , svg, viewbox, w, h;

    th.prepend(ai, at); // add header links
    if (!is_gist) $([ai, at]).wrap('<li></li>');

    // parse and inject the SVG image (as innerHTML can be lossy on XML content)
    svg = td.find('.highlight').text().replace(/\xA0/g, ' '); // XML source code
    svg = (new DOMParser).parseFromString(svg, 'text/xml'); // make XML document
    svg = document.importNode(svg.documentElement, true); // (HTML)SVGSVGElement
    svg = td.prepend(svg).find('svg:first'); // insert in doc, and jQuery:ify it

    // set width and height to fill the width of the image, subject to what
    // the viewBox declares (ignoring any width/height absolute units crap)
    svg.css({ width: tw });
    if ((viewbox = svg.prop('viewBox'))) {
      viewbox = viewbox.animVal;
      if ('number' === typeof (w = viewbox.width) &&
          'number' === typeof (h = viewbox.height))
        svg.css({ height: tw * h / w });
    }

    $(ai).click(); // show the image version by default
  });
}

/* page structure, one file:

<div class="file" id="file_octocat.svg">
  <div class="meta clearfix instapaper_ignore readability-extra">
    <div class="info">
      <span class="code">
        octocat.svg
        <a href="#file_octocat.svg">#</a>
      </span>
    </div>
    <div class="actions">
      <div id="gist-embed" style="display:inline;">
        <a href="#" class="gist-embed-link">embed</a>
        <input class="gist-embed-box" type="text" value="&lt;[...]&gt;">
      </div>
      <a href="/raw/1007813/[HASH HERE]/octocat.svg">raw</a>
    </div>
  </div>
  <div class="data type-text">
    <table cellpadding="0" cellspacing="0">
      <tbody><tr>
        <td><!-- line number; we toggle its style="display: none;" -->
          <pre class="line_numbers"><span id="L1" rel="#L1">1</span>[...]</pre>
        </td>
        <td width="100%"><!-- where 100% means 853px after hiding the above -->
          <!-- we inject our <svg xmlns=[...]>[...]</svg> tag here -->
          <div class="highlight">
            <pre><div class="line" id="LC1">[...]</div></pre>
          </div>
        </td>
      </tr></tbody>
    </table>
  </div>
</div>

*/

function show_as_image(e) {
  var me = $(e.target)
    , at = me.parents(sel_svg)
    ;
  e.preventDefault(); // don't scroll to top
  me.parents('.actions').find('a').css('color', '');
  me.css('color', '#000');

  at.find(sel_num).hide(); // hide line numbers
  at.find(sel_raw).children('svg:first').show().siblings().hide(); // show svg
}

function show_as_text(e) {
  var me = $(e.target)
    , at = me.parents(sel_svg)
    ;
  e.preventDefault(); // don't scroll to top
  me.parents('.actions').find('a').css('color', '');
  me.css('color', '#000');

  at.find(sel_num).show(); // show line numbers
  at.find(sel_raw).children('.highlight').show().siblings().hide(); // and file
}

function array(arrish) { return [].slice.call(arrish); }

function tag(name) {
  return function make_tag() {
    var args = array(arguments)
      , elem = document.createElement(name)
      , arg, key, val;
    while (undefined !== (arg = args.shift()))
      if ('string' === typeof arg)
        elem.appendChild(document.createTextNode(arg));
      else if (is_object(arg))
        for (key in arg)
          if ('function' === typeof(val = arg[key]))
            //elem.addEventListener(key, val, false); won't handle $(me).click()
            $(elem).bind(key, val);
          else
            elem.setAttribute(key, val);
      else
        elem.appendChild(arg);
    return elem;
  };
}

function is_object(obj) {
  return null != obj && Object === obj.__proto__.constructor;
}

// This block of code injects our source in the content scope and then calls the
// passed callback there. The whole script runs in both GM and page content, but
// since we have no other code that does anything, the Greasemonkey sandbox does
// nothing at all when it has spawned the page script, which gets to use jQuery.
// (jQuery unfortunately degrades much when run in Mozilla's javascript sandbox)
if ('object' === typeof opera && opera.extension) {
  this.__proto__ = window; // bleed the web page's js into our execution scope
  document.addEventListener('DOMContentLoaded', init, false); // GM-style init
}
else { // for Chrome or Firefox+Greasemonkey
  if ('undefined' == typeof __RUN_ME_IN_PG_SCOPE__) { // unsandbox, please!
    var src = exit_sandbox + '',
     script = document.createElement('script');
    script.setAttribute('type', 'application/javascript');
    script.innerHTML = 'const __RUN_ME_IN_PG_SCOPE__ = true;\n('+ src +')();';
    document.documentElement.appendChild(script);
    document.documentElement.removeChild(script);
  } else { // unsandboxed -- here we go!
    init();
  }
}

})();
