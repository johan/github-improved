// ==UserScript==
// @name          Github: unfold commit history
// @namespace     http://github.com/johan/
// @description   Adds "unfold all changesets" buttons (hotkey: f) above/below Commit History pages at github, letting you browse the source changes without leaving the page. (Click a commit header again to re-fold it.) You can also fold or unfold individual commits by clicking on non-link parts of the commit.
// @include       https://github.com/*/commits*
// @include       http://github.com/*/commits*
// ==/UserScript==

var toggle_options = // flip switches you configure by clicking in the UI here:
  { compact_committers: '#commit .human .actor .name span:contains("committer")'
  , chain_adjacent_connected_commits: '#commit > .separator > h2'
  , iso_times: '#commit .human .actor .date > abbr'
  }, options = // other options you have to edit this file for:
  { changed: true // Shows files changed, lines added / removed in folded mode
  }, at = '.commit.loading .machine a[hotkey="c"]',
    url = '/images/modules/browser/loading.gif',
    all = '.envelope.commit .message a:not(.loaded):not([href*="#"])',
    css = // used for .toggleClass('folded'), for, optionally, hiding:
  '.file.folded > .data,\n' + // individual .commit .changeset .file:s
  '.file.folded > .image,\n' + // (...or their corresponding .image:s)
  '.commit.folded .changeset,\n' + // whole .commit:s' diffs,
  '.commit.folded .message .full' + // + full checkin message
  ' { display: none; }\n' +
  '.chain_adjacent_connected_commits #commit .adjacent.commit:not(.selected)' +
  ':not(:last-child) { border-bottom-color: transparent; }\n' +
  at +':before\n { content: url("'+ url +'"); }\n'+  // show "loading" throbber
  at +'\n { position: absolute; margin: 1px 0 0 -70px; height: 14px; }\n' +
  '#commit .selected.loading .machine > span:nth-child(1) { border: none; }\n' +
  '#commit .machine { padding-left: 14px; padding-bottom: 0; }\n' +

  '.fold_unfold, .download_all { float: right; }\n' +
  '.all_folded .fold_unfold:before { content: "\xAB un"; }\n' +
  '.all_folded .fold_unfold:after { content: " \xBB"; }\n' +
  '.all_unfolded .fold_unfold:before { content: "\xBB "; }\n' +
  '.all_unfolded .fold_unfold:after { content: " \xAB"; }\n' +
  '#commit .human .message pre { width: auto; }\n' + // don't wrap before EOL!
  '.folded .message .truncated:after { content: " (\u2026)"; }\n' +

  '.compact_committers #commit .human .actor { width: 50%; float:left; }\n' +
  '.compact_committers #commit .human .actor:nth-of-type(odd) {' +
  ' text-align: right; clear: none; }\n' +
  '.compact_committers #commit .human .actor:nth-of-type(odd) .gravatar {' +
  ' float: right; margin: 0 0 0 0.7em; }\n' +

  'body:not(.iso_times) .date > .iso { display: none; }\n' +
  '.iso_times .date > .relatize.relatized:before { content: "("; }\n' +
  '.iso_times .date > .relatize.relatized:after { content: ")"; }\n' +
  '.iso_times .date > .relatize.relatized { display: inline; }\n' +
  '.iso_times .date > .relatize { display: none; }\n' +

  (!options.changed ? '' :
   '#commit .folded .machine { padding-bottom: 0; }\n' +
   '#commit .machine #toc .diffstat { border: 0; padding: 1px 0 0; }\n' +
   '#commit .machine #toc .diffstat-bar { opacity: 0.75; }\n' +
   '#commit .machine #toc .diffstat-summary { font-weight: normal; }\n'+
   '#commit .envelope.selected .machine #toc span { border-bottom: 0; }\n' +
   '#commit .machine #toc { float: right; width: 1px; margin: 0; border: 0; }');


// This block of code injects our source in the content scope and then calls the
// passed callback there. The whole script runs in both GM and page content, but
// since we have no other code that does anything, the Greasemonkey sandbox does
// nothing at all when it has spawned the page script, which gets to use jQuery.
// (jQuery unfortunately degrades much when run in Mozilla's javascript sandbox)
if ('object' === typeof opera && opera.extension) {
  this.__proto__ = window; // bleed the web page's js into our execution scope
  document.addEventListener('DOMContentLoaded', init, false); // GM-style init
} else (function(run_me_in_page_scope) { // for Chrome or Firefox+Greasemonkey
  if ('undefined' == typeof __UNFOLD_IN_PAGE_SCOPE__) { // unsandbox, please!
    var src = arguments.callee.caller.toString(),
     script = document.createElement('script');
    script.setAttribute("type", "application/javascript");
    script.innerHTML = "const __UNFOLD_IN_PAGE_SCOPE__ = true;\n("+ src +')();';
    document.documentElement.appendChild(script);
    document.documentElement.removeChild(script);
  } else { // unsandboxed -- here we go!
    run_me_in_page_scope();
  }
})(init);

function init() {
  $('body').addClass('all_folded') // preload the loading throbber, so it shows
    .append('<img src="'+ url +'" style="visibility:hidden;">'); // up promptly
  $('head').append($('<style type="text/css"></style>').html(css));
  $('.commit').live('click', toggle_commit_folding);

  prep_parent_links();
  $(document).bind('DOMNodeInserted', when_settled(prep_parent_links), false);
  $('a[href][hotkey=p]')
    .live('mouseover', null, hilight_related)
    .live('mouseout', null,  unlight_related)
    .live('click', null,   scroll_to_related); // if triggered by mouse click,
  // scroll to the commit if it's in view, otherwise load that page instead --
  // and ditto but for trigger by keyboard hotkey instead (falls back to link):
  GitHub.Commits.link = AOP_wrap_around(try_scroll_first, GitHub.Commits.link);

  init_config();

  $('<div class="pagination" style="margin: 0; padding: 0;"></div>')
    .prependTo('#commit .separator:first');
  $('<a class="download_all" hotkey="d"><u>d</u>ecorate all</a>')
    .appendTo('.pagination').click(download_all);
  $('<a class="fold_unfold" hotkey="f"><u>f</u>old all</a>')
    .appendTo('.pagination');
  $('.fold_unfold').toggle(unfold_all, fold_all);

  // export to public identifiers for the hotkeys
  window.toggle_selected_folding = toggle_selected_folding;
  window.toggle_all_folding      = toggle_all_folding;
  window.download_selected       = download_selected;
  window.download_all            = download_all;
  location.href = 'javascript:$.hotkeys(' +
    '{ f: toggle_selected_folding' +
    ', F: toggle_all_folding' +
    ', d: download_selected' +
    ', D: download_all' +
    '});' + // adds our own hotkeys
    'delete GitHub.Commits.elements;' + // makes j / k span demand-loaded pages
    'GitHub.Commits.__defineGetter__("elements",' +
        'function() { return $(".commit"); });void 0';

  setTimeout(function() { AOP_also_call('$.facebox.reveal', show_docs); }, 1e3);
}

// make all commits get @id:s c_<hash>, and all parent links get @rel="<hash>"
function prep_parent_links() {
  function hash(a) {
    return a.pathname.slice(a.pathname.lastIndexOf('/') + 1);
  }
  $('.commit:not([id]) a[href][hotkey=p]').each(function reroute() {
    $(this).attr('rel', hash(this));
  });
  $('.commit:not([id]) a[href][hotkey=c]').each(function set_id() {
    var id = hash(this), ci = $(this).closest('.commit'), pr = ci.prev();
    if (pr.find('a[hotkey=p][href$='+ id +']').length) pr.addClass('adjacent');
    ci.attr('id', 'c_' + id);
  });

  $('.date > abbr.relatize:first-child').each(unrelatize_dates);
}

function unrelatize_dates() {
  var ts = this.title, at = new Date(Date.parse(ts)), t = ts.split(' ')[1],
      wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getDay()];
  $(this).before('<abbr class="iso" title="'+ ts +'">'+ wd +' '+ t +' </abbr>');
}

function try_scroll_first(wrappee, link_type) {
  function normal() { return wrappee.apply(self, args); }
  var args = [].slice.call(arguments, 1), self = this;
  if (link_type !== 'p') return normal();

  var link = GitHub.Commits.selected().find('[hotkey="'+ link_type +'"]')[0];
  // scroll_to_related returns true if link is not in the current view
  if (link && scroll_to_related.call(link) &&
      confirm('Parent commit not in view -- load parent page instead?'))
    return normal();
  return false;
}

function scroll_to_related(e) {
  var to = $('#c_'+ this.rel);
  if (!to.length) return true;
  select(this.rel, true);
  return false;
}

// hilight the related commit changeset, when a commit link is hovered
function hilight_related(e) {
  $('#c_'+ this.rel).addClass('selected');
}

function unlight_related(e) {
  $('#c_'+ this.rel).removeClass('selected');
  if (null != GitHub.Commits.current)
    GitHub.Commits.select(GitHub.Commits.current);
}

function show_docs(x) {
  var docs =
  { f: '(un)Fold selected (or all, if none)'
  , d: 'Describe selected (or all, if none)'
  };
  for (var key in docs)
    $('#facebox .shortcuts .columns:first .column.middle dl:last')
      .before('<dl class="keyboard-mappings"><dt>'+ key +'</dt>' +
              '<dd>'+ docs[key] +'</dd></dl>');
  return x;
}


function init_config() {
  for (var o in toggle_options) {
    if ((options[o] = !!localStorage.getItem(o)))
      $('body').addClass(o);
    $(toggle_options[o])
      .live('click', { option: o }, toggle_option)
      .live('hover', { option: o }, show_docs_for);
  }
}

function toggle_option(e) {
  var o = e.data.option;
  if ((options[o] = !localStorage.getItem(o)))
    localStorage.setItem(o, '1');
  else
    localStorage.removeItem(o);
  $('body').toggleClass(o);
  show_docs_for.apply(this, arguments);
  return false; // do not fold / unfold
}

function show_docs_for(e) {
  var o = e.data.option;
  var is = !!localStorage.getItem(o);
  $(this).css('cursor', 'pointer')
         .attr('title', 'Click to toggle option "' + o.replace(/_/g, ' ') +'" '+
                        (is ? 'off' : 'on'));
}

function toggle_selected_folding() {
  var selected = $('.selected');
  if (selected.length)
    selected.click();
  else
    toggle_all_folding();
}

function download_selected() {
  var selected = $('.selected' + all);
  if (selected.length)
    selected.each(inline_changeset);
  else
    download_all();
}

function toggle_all_folding() {
  if ($('body').hasClass('all_folded'))
    unfold_all();
  else
    fold_all();
}

function download_all() {
  $(all).each(inline_changeset);
}

function unfold_all() {
  $('body').addClass('all_unfolded').removeClass('all_folded');
  $('.commit.folded').removeClass('folded');
  $(all).each(inline_and_unfold);
}

function fold_all() {
  $('body').addClass('all_folded').removeClass('all_unfolded');
  $('.commit').addClass('folded');
}

// click to fold / unfold, and select:
function toggle_commit_folding(e) {
  if (isNotLeftButton(e) || $(e.target).closest('a[href], .changeset').length)
    return; // clicked a link, or in the changeset; don't do fold action

  var $link = $('.message a:not([href*="#"])', this);
  if ($link.hasClass('loaded'))
    $(this).toggleClass('folded');
  else
    $link.each(inline_and_unfold);

  select($($(this).closest('.commit')), !'scroll');
}

// pass a changeset node, id or hash and have github select it for us
function select(changeset, scroll) {
  var node = changeset, nth;
  if ('string' === typeof changeset)
    node = $('#'+ (/^c_/.test(changeset) ? '' : 'c_') + changeset);
  nth = $('.commit').index(node);
  pageCall('GitHub.Commits.select', nth);
  if (scroll) setTimeout(function() {
    var focused = $('.commit.selected');
  //if (focused.offset().top - $(window).scrollTop() + 50 > $(window).height())
      focused.scrollTo(200);
  }, 50);
}

function pageCall(fn/*, arg, ... */) {
  var args = JSON.stringify([].slice.call(arguments, 1)).slice(1, -1);
  location.href = 'javascript:void '+ fn +'('+ args +')';
}

// every mouse click is not interesting; return true only on left mouse clicks
function isNotLeftButton(e) {
  // IE has e.which === null for left click && mouseover, FF has e.which === 1
  return (e.which > 1) || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;
}

function pluralize(noun, n) {
  return n +' '+ noun + (n == 1 ? '' : 's');
}

function inline_and_unfold() {
  var $c = $(this).closest('.commit');
  inline_changeset.call(this, function() { $c.removeClass('folded'); });
}

function n(x) {
  if (x > (1e9 - 5e7 - 1)) return Math.round(x / 1e9) +'G';
  if (x > (1e6 - 5e4 - 1)) return Math.round(x / 1e6) +'M';
  if (x > (1e3 - 5e1 - 1)) return Math.round(x / 1e3) +'k';
  return x + '';
}

// loads the changeset link's full commit message, toc and the files changed and
// inlines them in the corresponding changeset (in the current page)
function inline_changeset(doneCallback) {
  // make file header click toggle showing file contents (except links @ right)
  function toggle_file(e) {
    if (isNotLeftButton(e) || $(e.target).closest('.actions').length)
      return; // wrong kind of mouse click, or a right-side action link click
    $(this).parent().toggleClass('folded');
  }

  // diff links for this commit should refer to this commit only
  function fix_link() {
    var old = this.id;
    this.id += '-' + sha1;
    changeset.find('a[href="#'+ old +'"]')
             .attr('href', '#'+ this.id);
    $('div.meta', this).click(toggle_file)
                       .css('cursor', 'pointer')
                       .attr('title', 'Toggle showing of file')
      .find('.actions').attr('title', ' '); // but don't over-report that title
  }

  function show_changed() {
    var $m = $('.machine', commit), alreadyChanged = $m.find('#toc').length;
    if (alreadyChanged) return;
    var F = 0, A = 0, D = 0, $a = $m.append('diff' +
        '<table id="toc"><tbody><tr><td class="diffstat">' +
          '<a class="tooltipped leftwards"></a>' +
        '</td></tr></tbody></table>').find('#toc a');

    // count added / removed lines and number of files changed
    $('.changeset #toc .diffstat a[title]', commit).each(function count() {
      ++F; // files touched
      var lines = /(\d+) additions? & (\d+) deletion/.exec(this.title || '');
      if (lines) {
        A += Number(lines[1]); // lines added
        D += Number(lines[2]); // lines deleted
      }
    });

    var text = '<b>+'+ n(A) +'</b> / <b>-'+ n(D) +'</b> in <b>'+ n(F) +'</b>',
        stat = '<span class="diffstat-summary">'+ text +'</span>\n', i, N = 5,
        plus = Math.round(A / (A + D) * N), bar = '<span class="diffstat-bar">';
    // don't show more blobs than total lines, and show ties as even # of blobs
    if (A + D < N) { plus = A; N = A + D; } else if (A === D) { --plus; --N; }
    for (i = 0; i < N; i++)
      bar += '<span class="'+ (i < plus ? 'plus' : 'minus') +'">\u2022</span>';
    bar += '</span>';

    $a.html(stat + bar).attr('title', A +' additions & '+ D +' deletions in '+
                             pluralize('file', F));
  }

  // find all diff links and fix them, annotate how many files were changed, and
  // insert line 2.. of the commit message in the unfolded view of the changeset
  function post_process() {
    github_inlined_comments(this);

    var files = changeset.find('[id^="diff-"]').each(fix_link), line2;

    if (options.changed) show_changed();

    // now, add lines 2.. of the commit message to the unfolded changeset view
    var whole = $('#commit', changeset); // contains the whole commit message
    try {
      if ((line2 = $('.message pre', whole).html().replace(line1, ''))) {
        $('.human .message pre', commit).append(
          $('<span class="full"></span>').html(line2)); // commit message
        $('.human .message pre a:not([href*="#"])', commit).after(
          '<span title="Message continues..." class="truncated"></span>');
      }
    } catch(e) {} // if this fails, fail silent -- no biggie
    whole.remove(); // and remove the remaining duplicate parts of that commit

    commit.removeClass('loading'); // remove throbber
    if ('function' === typeof doneCallback) doneCallback();
  }

  var line1  = /^[^\n]*/,
      sha1   = this.pathname.slice(this.pathname.lastIndexOf('/') + 1),
      commit = $(this).closest('.commit').addClass('loading folded');
  $(this).addClass('loaded'); // mark that we already did load it on this page
  commit.find('.human, .machine')
    .css('cursor', 'pointer');
  var changeset = commit
    .append('<div class="changeset" style="float: left; width: 100%;"/>')
    .find('.changeset') // ,#all_commit_comments removed from next line
    .load(this.href + '.html #commit,#toc,#files', post_process);
}

// Makes a function that can replace wrappee that instead calls wrapper(wrappee)
// plus all the args wrappee should have received. (If wrapper does not want the
// original function to run, it does not have to.)
function AOP_wrap_around(wrapper, wrappee) {
  return function() {
    return wrapper.apply(this, [wrappee].concat([].slice.call(arguments, 0)));
  };
}

// replace <name> with a function that returns fn(name(...))
function AOP_also_call(name, fn) {
  location.href = 'javascript:try {'+ name +' = (function(orig) {\n' +
    'return function() {\n' +
      'var res = orig.apply(this, arguments);\n' +
      'return ('+ (fn.toString()) +')(res);' +
    '};' +
  '})('+ name +')} finally {void 0}';
}

// drop calls until at least <ms> (or 100) ms apart, then pass the last on to cb
function when_settled(cb, ms) {
  function is_settled() {
    waiter = last = null;
    cb.apply(self, args);
  };

  ms = ms || 100;
  var last, waiter, self, args;

  return function () {
    self = this;
    args = arguments;
    if (waiter) clearTimeout(waiter);
    waiter = setTimeout(is_settled, 100);
  };
}

// Github handlers (from http://assets1.github.com/javascripts/bundle_github.js)
// - this is all probably prone to die horribly as the site grows features, over
// time, unless this functionality gets absorbed and maintained by github later.

// In other words, everything below is really just the minimum copy-paste needed
// from the site javascript for inline comments to work -- minimal testing done.

// 5:th $(function) in http://assets1.github.com/javascripts/bundle_github.js,
// but with $() selectors scoped to a "self" node passed from the caller above.
// On unfolding changeset pages with inline comments, we need to make them live,
// as github itself is loading them dynamically after DOMContentLoaded.
function github_inlined_comments(self) {
  $(".inline-comment-placeholder", self).each(function () {
    var c = $(this);
    $.get(c.attr("remote"), function got_comment_form(page) {
      page = $(page);
      c.closest("tr").replaceWith(page);
      github_comment_form(page);
      github_comment(page.find(".comment"));
    });
  });

  $("#files .show-inline-comments-toggle", self).change(function () {
    this.checked ? $(this).closest(".file").find("tr.inline-comments").show()
                 : $(this).closest(".file").find("tr.inline-comments").hide();
  }).change();

  $("#inline_comments_toggle input", self).change(function () {
    this.checked ? $("#comments").removeClass("only-commit-comments")
                 : $("#comments").addClass("only-commit-comments");
  }).change();
}

// http://assets1.github.com/javascripts/bundle_github.js::e(c)
function github_comment_form(c) {
  c.find("ul.inline-tabs").tabs();

  c.find(".show-inline-comment-form a").click(function () {
    c.find(".inline-comment-form").show();
    $(this).hide();
    return false;
  });

  var b = c.find(".previewable-comment-form")
           .previewableCommentForm().closest("form");

  b.submit(function () {
    b.find(".ajaxindicator").show();
    b.find("button").attr("disabled", "disabled");
    b.ajaxSubmit({
      success: function (f) {
        var h = b.closest(".clipper"),
            d = h.find(".comment-holder");
        if (d.length == 0)
          d = h.prepend($('<div class="inset comment-holder"></div>'))
               .find(".comment-holder");
        f = $(f);
        d.append(f);
        github_comment(f);
        b.find("textarea").val("");
        b.find(".ajaxindicator").hide();
        b.find("button").attr("disabled", "");
      }
    });
    return false;
  });
}

// http://assets1.github.com/javascripts/bundle_github.js::a(c)
function github_comment(c) {
  c.find(".relatize").relatizeDate();
  c.editableComment();
}
