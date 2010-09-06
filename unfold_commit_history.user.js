// ==UserScript==
// @name          Github: unfold commit history
// @namespace     http://github.com/johan/
// @description   Adds "unfold all changesets" buttons (hotkey: f) above/below Commit History pages at github, letting you browse the source changes without leaving the page. (Click a commit header again to re-fold it.) You can also fold or unfold individual commits by clicking on non-link parts of the commit.
// @include       https://github.com/*/commits*
// @include       http://github.com/*/commits*
// ==/UserScript==

var options =
  { changed: true // Shows files changed, lines added / removed in folded mode
  }, at = '.commit.loading .machine a[hotkey="c"]',
    url = '/images/modules/browser/loading.gif',
    css = // used for .toggleClass('folded'), for, optionally, hiding:
  '.file.folded > .data,\n' + // individual .commit .changeset .file:s
  '.file.folded > .image,\n' + // (...or their corresponding .image:s)
  '.commit.folded .changeset,\n' + // whole .commit:s' diffs,
  '.commit.folded .message .full' + // + full checkin message
  ' { display: none; }\n' +
  at +':before\n { content: url("'+ url +'"); }\n'+  // show "loading" throbber
  at +'\n { position: absolute; margin: 1px 0 0 -70px;' +
  ' height: 14px; background: #EAF2F5; }\n' +
  '#commit .machine { padding-left: 14px; }\n' + // over "commit" message
  '.fold_unfold, .download_all { float: right; }\n' +
  '.all_folded .fold_unfold:before { content: "\xAB un"; }\n' +
  '.all_folded .fold_unfold:after { content: " \xBB"; }\n' +
  '.all_unfolded .fold_unfold:before { content: "\xBB "; }\n' +
  '.all_unfolded .fold_unfold:after { content: " \xAB"; }\n' +
  '#commit .human .message pre { width: auto; }\n' + // don't wrap before EOL!
  (!options.changed ? '' :
   '#commit .folded .machine { padding-bottom: 0; }\n' +
   '#commit .machine #toc .diffstat { border: 0; padding: 2px 0 0; }\n' +
   '#commit .machine #toc .diffstat-bar { opacity: 0.75; }\n' +
   '#commit .machine #toc .diffstat-summary { font-weight: normal; }\n' +
   '#commit .machine #toc { float: right; width: 1px; margin: 0; border: 0; }');


// This block of code injects our source in the content scope and then calls the
// passed callback there. The whole script runs in both GM and page content, but
// since we have no other code that does anything, the Greasemonkey sandbox does
// nothing at all when it has spawned the page script, which gets to use jQuery.
// (jQuery unfortunately degrades much when run in Mozilla's javascript sandbox)
(function(run_me_in_page_scope) {
  if ('undefined' == typeof __RUNS_IN_PAGE_SCOPE__) { // unsandbox, please!
    var src = arguments.callee.caller.toString(),
     script = document.createElement('script');
    script.setAttribute("type", "application/javascript");
    script.innerHTML = "const __RUNS_IN_PAGE_SCOPE__ = true;\n(" + src + ')();';
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

  $('<div class="pagination" style="margin: 0; padding: 0;"></div>')
    .prependTo('#commit .separator:first');
  $('<a class="download_all" hotkey="d"><u>d</u>ecorate all</a>')
    .appendTo('.pagination').click(download_all);
  $('<a class="fold_unfold" hotkey="f"><u>f</u>old all</a>')
    .appendTo('.pagination');
  $('.fold_unfold').toggle(unfold_all, fold_all);
  window.download_all = download_all; // export to public identifier
  window.toggle_all_folding = toggle_all_folding; // export to public identifier
  $.hotkey('d', 'javascript:void(download_all())');
  $.hotkey('f', 'javascript:void(toggle_all_folding())');
}

function toggle_all_folding() {
  if ($('body').hasClass('all_folded'))
    unfold_all();
  else
    fold_all();
}

function download_all() {
  $('.envelope.commit .message a:not(.loaded)').each(inline_changeset);
}

function unfold_all() {
  $('body').addClass('all_unfolded').removeClass('all_folded');
  $('.commit.folded').removeClass('folded');
  $('.envelope.commit .message a:not(.loaded)').each(inline_and_unfold);
}

function fold_all() {
  $('body').addClass('all_folded').removeClass('all_unfolded');
  $('.commit').addClass('folded');
}

function toggle_commit_folding(e) {
  if (isNotLeftButton(e) || $(e.target).closest('a[href], .changeset').length)
    return; // clicked a link, or in the changeset; don't do fold action

  var $link = $('.message a', this);
  if ($link.hasClass('loaded'))
    $(this).toggleClass('folded');
  else
    $link.each(inline_and_unfold);
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
    var F = 0, A = 0, D = 0, $a = $m.append('<span>c</span>hange' +
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
    for (i = 0; i < N; i++)
      bar += '<span class="'+ (i < plus ? 'plus' : 'minus') +'">\u2022</span>';
    bar += '</span>';

    $a.html(stat + bar).attr('title', A +' additions & '+ D +' deletions in '+
                             pluralize('file', F));
  }

  // find all diff links and fix them, annotate how many files were changed, and
  // insert line 2.. of the commit message in the unfolded view of the changeset
  function post_process() {
    // the inline comments on the page are loaded dynamically, and get us more
    // onload events than we want -- the first time, get them, otherwise, drop!
    if (post_process.done) { $(this).remove(); return; } post_process.done = 1;
    github_inlined_comments(this);

    var files = changeset.find('[id^="diff-"]').each(fix_link);

    if (options.changed) show_changed();

    // now, add lines 2.. of the commit message to the unfolded changeset view
    var whole = $('#commit', changeset); // contains the whole commit message
    try {
      var line2 = $('.message pre', whole).html().replace(line1, ''),
          $span = line2 && $('<span class="full"></span>').html(line2);
      if (line2)
        $('.human .message pre', commit).append($span); // commit message <pre>
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


// Github handlers (from http://assets1.github.com/javascripts/bundle_github.js)
// - this is all

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
