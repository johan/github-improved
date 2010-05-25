// ==UserScript==
// @name          Github: unfold commit history
// @namespace     http://github.com/johan/
// @description   Adds an "unfold all changesets" button on Commit History pages at github, which lets you browse the source changes without leaving the page. /Click a commit header again to re-fold it.)
// @include       https://github.com/*/commits/*
// @include       http://github.com/*/commits/*
// ==/UserScript==

(function() {
  if ('undefined' == typeof __PAGE_SCOPE_RUN__) { // unsandbox, please!
    var src = arguments.callee.caller.toString();
    var script = document.createElement('script');
    script.setAttribute("type", "application/javascript");
    script.innerHTML = "const __PAGE_SCOPE_RUN__ = true;\n(" + src + ')();';
    document.documentElement.appendChild(script);
    document.documentElement.removeChild(script);
  } else { // unsandboxed -- here we go!
    $('<a class="fold_unfold" style="float: right;">unfold all changesets</a>')
      .appendTo('#path').toggle(unfold, fold);
  }
})();

function unfold() {
  var changesets = $('.changeset');
  if (changesets.length)
    changesets.show();
  else
    $('.envelope.commit .message a').each(inline);
  this.textContent = 'fold all changesets';
}

function fold() {
  $('.changeset').hide();
  this.textContent = 'unfold all changesets';
}

function toggle_changeset(e) {
  if (isNotLeftButton(e) || $(e.target).closest('a, .changeset').length)
    return; // clicked a link, or in the changeset
  $('.changeset', this).toggle();
}

// every mouse click is not interesting; return true only on left mouse clicks
function isNotLeftButton(e) {
  // IE has e.which === null for left click && mouseover, FF has e.which === 1
  return (e.which > 1) || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey;
}

function inline() {
  // make file header click toggle showing file contents (except links @ right)
  function toggle_file(e) {
    if (isNotLeftButton(e) || $(e.target).closest('.actions').length)
      return; // wrong kind of mouse click, or a right-side action link click
    $(this).siblings('.data').toggle();
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

  // find all diff links and fix them, and annotate how many files were changed
  function fix_links() {
    var files = changeset.find('[id^="diff-"]').each(fix_link);
    var count = files.length;
    commit.attr('title', 'Touched '+ count +' file'+ (count == 1 ? '' : 's'));
  }

  var sha1 = this.pathname.slice(this.pathname.lastIndexOf('/') + 1);
  var commit = $(this)
    .closest('.commit')
    .click(toggle_changeset);
  commit.find('.human, .machine')
    .css('cursor', 'pointer');
  var changeset = commit
    .append('<div class="changeset" style="float: left; width: 100%;"/>')
    .find('.changeset')
    .load(this.href + '.html #toc,#files', fix_links); // ,#all_commit_comments
}
