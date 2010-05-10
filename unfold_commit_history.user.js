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
  if ($(e.target).closest('a, .changeset').length)
    return; // clicked a link, or in the changeset
  $('.changeset', this).toggle();
}

function inline() {
  function fix_link() {
    var old = this.id;
    this.id += '-' + sha1;
    changeset.find('a[href="#'+ old +'"]')
             .attr('href', '#'+ this.id);
  }

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
