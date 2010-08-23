// ==UserScript==
// @name          Github: unfold commit history
// @namespace     http://github.com/johan/
// @description   Adds an "unfold all changesets" button on Commit History pages at github, which lets you browse the source changes without leaving the page. (Click a commit header again to re-fold it.)
// @include       https://github.com/*/commits/*
// @include       http://github.com/*/commits/*
// ==/UserScript==

var css = // used for .toggleClass('folded'), for, optionally, hiding:
  '.file.folded > .data,\n' + // individual .commit .changeset .file:s
  '.commit.folded .changeset,\n' + // whole .commit:s' diffs,
  '.commit.folded .message .full' + // + full checkin message
  ' { display: none; }';

(function() {
  if ('undefined' == typeof __PAGE_SCOPE_RUN__) { // unsandbox, please!
    var src = arguments.callee.caller.toString(),
     script = document.createElement('script');
    script.setAttribute("type", "application/javascript");
    script.innerHTML = "const __PAGE_SCOPE_RUN__ = true;\n(" + src + ')();';
    document.documentElement.appendChild(script);
    document.documentElement.removeChild(script);
  } else { // unsandboxed -- here we go!
    $('head').append($('<style type="text/css"></style>').html(css));
    $('<a class="fold_unfold" style="float: right;">unfold all changesets</a>')
      .appendTo('#path').toggle(unfold, fold);
  }
})();

function unfold() {
  var changesets = $('.changeset');
  if (changesets.length)
    changesets.parent().removeClass('folded');
  else
    $('.envelope.commit .message a').each(inline);
  this.textContent = 'fold all changesets';
}

function fold() {
  $('.changeset').parent().addClass('folded');
  this.textContent = 'unfold all changesets';
}

function toggle_changeset(e) {
  if (isNotLeftButton(e) || $(e.target).closest('a, .changeset').length)
    return; // clicked a link, or in the changeset
  $('.changeset', this).parent().toggleClass('folded');
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

  // find all diff links and fix them, annotate how many files were changed, and
  // insert line 2.. of the commit message in the unfolded view of the changeset
  function post_process() {
    var files = changeset.find('[id^="diff-"]').each(fix_link),
        count = files.length;
    commit.attr('title', 'Touched '+ count +' file'+ (count == 1 ? '' : 's'));

    // now, add lines 2.. of the commit message to the unfolded changeset view
    var whole = $('#commit', changeset), // contains the whole commit message
        line2 = $('.message pre', whole).html().replace(line1, ''),
        $span = $('<span class="full"></span>').html(line2);
    whole.remove(); // and remove the remaining duplicate parts of that commit
    $('.human .message pre', commit).append($span); // <pre> of commit message
  }

  var line1  = /^[^\n]*/,
      sha1   = this.pathname.slice(this.pathname.lastIndexOf('/') + 1),
      commit = $(this)
    .closest('.commit')
    .click(toggle_changeset);
  commit.find('.human, .machine')
    .css('cursor', 'pointer');
  var changeset = commit
    .append('<div class="changeset" style="float: left; width: 100%;"/>')
    .find('.changeset') // ,#all_commit_comments removed from next line
    .load(this.href + '.html #commit,#toc,#files', post_process);
}
