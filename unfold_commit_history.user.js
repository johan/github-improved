// ==UserScript==
// @name          Github: unfold commit history
// @namespace     http://github.com/johan/
// @description   Adds "unfold all changesets" buttons (hotkey: f) above/below Commit History pages at github, letting you browse the source changes without leaving the page. (Click a commit header again to re-fold it.) You can also fold or unfold individual commits by clicking on non-link parts of the commit. As a bonus, all named commits get their tag/branch names annotated in little bubbles on the right.
// @include       https://github.com/*/search*
// @include       https://github.com/*/commits*
// @match         https://github.com/*/commits*
// @match         https://github.com/*/search*
// @version       1.9.3
// ==/UserScript==

(function exit_sandbox() { // see end of file for unsandboxing code

// FIXME: enabled_css + disabled_css + github_css?
var hot = 'data-key' // used to find links with hotkey assignments
  , features =
  // Problem: where committer != author is the norm, you can't scan for either!
  //
  // So instead of aligning both left (and below each other) divide the page in
  // the middle -- ALWAYS showing authors on the left / committers on the right.
  { compact_committers:
    // the text "(committer)" is the hot spot to toggle this feature on and off:
    { toggle_selector: '#commit .human .actor .name span:contains("committer")'
    , css:
      [ '#commit .human .actor { width: 50%; float: left; }' // overrides github
      , '.compact_committers #commit .human .actor:nth-of-type(odd) {'
        + ' text-align: right; clear: none; }' // committer name
      , '.compact_committers #commit .human .actor:nth-of-type(odd) .gravatar {'
        + ' float: right; margin: 0 0 0 0.7em; }' // committer icon
      ]
    }

  // Problem: it's impossible to tell which commits are tiny and which are huge
  //
  // So let's show a little diff line on the right once we have the data loaded
  // which shows how many lines were added/removed, and across how many files.
  , change_counts_for_folded_commits_too:
    { always_enabled: true
    , css:
      [ '#commit .folded .machine { padding-bottom: 0; }'
      , '#commit .machine #toc .diffstat { border: 0; padding: 1px 0 0; }'
      , '#commit .machine #toc .diffstat-bar { opacity: 0.75; }'
      , '#commit .machine #toc .diffstat-summary { font-weight: normal; }'
      , '#commit .envelope.selected .machine #toc span { border-bottom: 0; }'
      , '#commit .machine #toc {'
        + ' float: right; width: 1px; margin: 0; border: 0; }'
      ]
    , show_diff: function called_from_inline_changeset(commit) {
        function count() {
          ++FILES;
          var lines = /(\d+) additions? & (\d+) deletion/.exec(this.title||'');
          if (lines) {
            ADD += Number(lines[1]); // lines added
            DEL += Number(lines[2]); // lines deleted
          }
        }

        var $m = $('.machine', commit)
          , already_changed = $m.find('#toc').length;
        if (already_changed) return;

        var ADD = 0, DEL = 0, FILES = 0, BLOBS = 5, $a = $m.append('diff' +
            '<table id="toc"><tbody><tr><td class="diffstat">' +
              '<a class="tooltipped leftwards"></a>' +
            '</td></tr></tbody></table>').find('#toc a');

        // count added / removed lines and number of files changed
        $('.changeset #toc .diffstat a[title]', commit).each(count);

        var text = '<b>+'+ n(ADD) +'</b> / '
                 + '<b>-'+ n(DEL) +'</b> in '
                 + '<b>' + n(FILES) +'</b>'
          , stat = '<span class="diffstat-summary">'+ text +'</span>\n'
          , plus = Math.round(ADD / (ADD + DEL) * BLOBS)
          , bar  = '<span class="diffstat-bar">';

        // don't show more blobs than total lines,
        if (ADD + DEL < BLOBS) { plus = ADD; BLOBS = ADD + DEL; }
        // and show ties as an even number of blobs
        else if (ADD === DEL) { --plus; --BLOBS; }

        for (var i = 0; i < BLOBS; i++)
          bar += '<span class="'+ (i < plus ? 'plus' : 'minus') +
                 '">\u2022</span>';
        bar += '</span>';

        $a.html(stat + bar).attr('title', ADD +' additions & '+ DEL +
                                 ' deletions in '+ pluralize('file', FILES));
      }
    }

  // Problem: I can't see where commit history is linear and where it's disjoint
  //
  // When enabling this mode, a linear history (one where adjacent commits MEAN
  // that the commit above is the direct, single parent of the commit below it)
  // shows up WITHOUT the little dark blue separator between them and non-linar
  // history (two commits where the adjacency is just incidental) keep the bar.
  , chain_adjacent_connected_commits:
    { toggle_selector: '#commit > .separator > h2' // a date header (bad choice)
    , css:
      [ '.chain_adjacent_connected_commits '
        + '#commit .adjacent.commit:not(.selected):not(:last-child) {'
        + ' border-bottom-color: transparent; }'
      ]
    }

  // Problem: I can't scan commit history for commits by weekday or time of day
  //
  // Where github has <time title="2011-06-18 15:10:54">33 minutes ago</time>,
  // iso_times will upgrade to add a prefix like <abbr>Sat 14:58:30</abbr> and
  // surround the "33 minutes ago" in parentheses. This lets you visually scan
  // the page for commits by weekday or time of day without getting frustrated.
  , iso_times:
    { toggle_selector: '#commit .human .actor .date' // a commit timestamp
    , css:
      [ 'body:not(.iso_times) .date > .iso { display: none; }'
      , '.iso_times .date > time:before { content: "("; }'
      , '.iso_times .date > time:after { content: ")"; }'
      ]
    , on_page_change: function() {
        function prepend_absolute_wday_times() {
          var iso  = this.title
            , time = iso.split(' ')[1]
            , date = new Date(iso.replace(/-/g, '/'))
            , week = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            , day  = week[date.getDay()];
          $(this).before('<abbr class="iso" title="'+ iso +'">'+
                         day +' '+ time +' </abbr>');
        }
        $('.date > time:first-child').each(prepend_absolute_wday_times);
      }
    }

  // Problem: I want to narrow the view to commits authored by (or not by) X/Y/Z
  // Problem: I want to see what proportion of commits were authored by X/Y/Z
  //
  // This adds a little panel on top (between "Commit History" and the commits),
  // listing icons for all authors that have one commit or more in the page, and
  // also sizes them (the white bar becomes one pixel wider per commit shown) by
  // how many commits they contributed. Click any author to toggle visibility of
  // all their commits on and off. When hidden, that author is grayed out. Click
  // a commit author icon again to hide the panel, and show commits by everyone.
  , author_filter:
    // The author icon of a commit in the page
    { toggle_selector: '.commit .human .actor:nth-child(2) .gravatar > img'
    , toggle_callback: function(on) {
        $('#filtered_authors').attr('disabled', !on);
      }
    , css:
      [ 'body:not(.author_filter) #author_filter { display: none; }'
      , '#author_filter img.filtered { opacity: 0.5; }'
      , '#author_filter img {'
        + ' margin: 0 .3em 0 0; background-color: white; '
        + ' padding: 2px; border: 1px solid #D0D0D0; }'
      ]
    , init: function draw_filter_panel() {
        $('#path').after('<div id="author_filter"></div>');
      }
    , on_page_change: function render_author_filter(e) {
        // Count a commit in the view and add it to the author filter.
        // Marks it with classes "by" and "author_<hash>" classes too.
        // Also, we create / update the #author_<hash> filter element.
        function update_author_filter(e) {
          var mail_hash = /avatar\/([a-f\d]{32})/.exec(this.src)
            , author_id = 'author_'+ mail_hash[1]
            , author_re = /\s*\(author\)\s*$/
            , $gravatar = $('#'+ author_id)
            , commit_no = parseInt($gravatar.attr('title') || '0', 10)
            , $envelope = !commit_no && $(this).parents('.actor');
          if ($envelope) {
            var img = this.cloneNode(true);
            img.alt = $envelope.find('.name').text().replace(author_re, '');
            img.id  = author_id;
            $('#author_filter').append(img);
            $(img).click(toggle_author_commits);
            img.title = ++commit_no +' commit by '+ img.alt;
            $('head').append('<style id="filtered_authors"></style>');
          }
          else
            $gravatar.attr('title',
                           ++commit_no +' commits by '+ $gravatar.attr('alt'));
          $(this).parents('.commit').addClass('by '+author_id);
          $('#'+ author_id).css('padding-right', (1 + commit_no) +'px');
        }

        // toggle commit visibility for a clicked author icon in the panel
        function toggle_author_commits(e) {
          function get_author_nick() { return this.id; }
          $(this).toggleClass('filtered');
          var hide = $('#author_filter .filtered').map(get_author_nick);
          if (hide.length)
            hide = '.'+ (array(hide).join(',.')) +' { display: none; }';
          else hide = '';
          $('style#filtered_authors').html(hide); // updates the hiddenness css
        }

        $('.commit:not(.by) .human .actor:nth-child(2) .gravatar > img')
          .each(update_author_filter); // find not-yet-catered commits
      }
    }
  }

, DEV_MODE = 'undefined' !== typeof console && console.warn &&
             window.localStorage.getItem('github_improved_dev')
, ENTER = !DEV_MODE ? function(){}
  : function ENTER(id) {
      (ENTER[id] = ENTER[id] || []).push(+new Date);
    }
, LEAVE = !DEV_MODE ? ENTER
  : function LEAVE(id) {
      var dt = new Date - ENTER[id].pop();
      if (dt > 100) console.warn(dt +'ms in github improved '+ id);
    }
;

var  at = '.commit.loading .machine a['+ hot +'="c"]',
    url = '/images/modules/browser/loading.gif',
  plain = ':not(.magic):not([href*="#"])',

  // all changeset links in the message context of their own changeset
    all = '.envelope.commit .message a[href^="/"]:not(.loaded)'+ plain,
    css = // used for .toggleClass('folded'), for, optionally, hiding:
  '.file.folded > .data,\n' + // individual .commit .changeset .file:s
  '.file.folded > .image,\n' + // (...or their corresponding .image:s)
  '.commit.folded .changeset,\n' + // whole .commit:s' diffs,
  '.commit.folded .message .full' + // + full checkin message
  ' { display: none; }\n' +
  at +':before\n { content: url("'+ url +'"); }\n'+  // show "loading" throbber
  at +'\n { position: absolute; margin: 1px 0 0 -70px; height: 14px; }\n' +
  '#commit .selected.loading .machine > span:nth-child(1) { border: none; }\n' +
  '#commit .machine { padding-left: 14px; padding-bottom: 0; }\n' +

  // The site has a .site { width: 920px } but #commit .human { width: 50em; },
  // which looks bad in Opera, where it becomes about 650px only. Address this:
  '#commit .human { width: 667px; }\n' +

  // fold / unfold behaviour
  '.fold_unfold, .download_all { float: right; }\n' +
  '.all_folded .fold_unfold:before { content: "\xAB un"; }\n' +
  '.all_folded .fold_unfold:after { content: " \xBB"; }\n' +
  '.all_unfolded .fold_unfold:before { content: "\xBB "; }\n' +
  '.all_unfolded .fold_unfold:after { content: " \xAB"; }\n' +
  '#commit .human .message pre { width: auto; }\n' + // don't wrap before EOL!
  '.folded .message .truncated:after { content: " (\u2026)"; }\n' +

  // tag and branch labels:
  '.magic.tag, .magic.branch { opacity: 0.75; }' +
  '.message .tag { background: #FE7; text-align: right; padding: 0 2px; ' +
  ' margin: 0 -5px .1em 0; border-radius: 4px; float: right; clear: both; }\n' +
  '.message .branch { background: #7EF; text-align: right; padding: 0 2px; ' +
  ' margin: 0 -5px .1em 0; border-radius: 4px; float: right; clear: both; }\n' +

  '.magic.tag.diff { clear: left; margin-right: 0.25em; }\n' // &Delta; marker
;

var keys = Object.keys || function _keys(o) {
  var r = [], k;
  for (k in o) if (o.hasOwnProperty(k)) r.push(k);
  return r;
};

// Run first at init, and then once per (settled) page change, for later updates
// caused by stuff like AutoPagerize.
function onChange() {
  ENTER('onChange::prep_parent_links');
  prep_parent_links(); // FIXME: integrate these in features / the loop below:
  LEAVE('onChange::prep_parent_links');
  for (var name in features) {
    var feature  = features[name]
      , callback = feature.on_page_change;
    if (callback) {
      ENTER('onChange::'+ name);
      callback();
      LEAVE('onChange::'+ name);
    }
  }
  ENTER('onChange::inject_commit_names');
  inject_commit_names(); // FIXME: integrate too as per above
  LEAVE('onChange::inject_commit_names');
}

function init() {
  ENTER('init');
  var name, feature;
  $('body').addClass('all_folded') // preload the loading throbber, so it shows
    .append('<img src="'+ url +'" style="visibility:hidden;">'); // up promptly

  for (name in features)
    if ((feature = features[name]).css)
      css += feature.css.join('\n') + '\n';
  $('head').append($('<style type="text/css"></style>').html(css));

  for (name in features)
    if ((feature = features[name]).init)
      feature.init();

  $('.commit').live('click', toggle_commit_folding);

  // Resuscitate "Diff suppressed. Click to show" links in imported diffs. This
  // one taken from /ie-addon/commits/68ae2cf1446bdfc606f5fb1f26cee18258f20e9a:
  // <div class="file" id="diff-0-68ae2cf1446bdfc606f5fb1f26cee18258f20e9a">
  //   <div class="meta" data-path="GetSmartLinks/control.js">file header</div>
  //   <div class="image"><a href="#" class="js-show-suppressed-diff">
  //     Diff suppressed. Click to show.
  //   </a></div>
  //   <div class="data highlight"><table>[real diff here]</table></data>
  // <div>
  $('.commit .image > a.js-show-suppressed-diff').live('click', function(e) {
    $(this).parent().hide().parent().find('.highlight').show();
    e.preventDefault(); // don't scroll to the top of the page!
  });

  onChange();
  on_dom_change('body', onChange);

  $('a[href]['+ hot +'="p"]')
    .live('mouseover', null, hilight_related)
    .live('mouseout', null,  unlight_related)
    .live('click', null,   scroll_to_related); // if triggered by mouse click,
  // scroll to the commit if it's in view, otherwise load that page instead --
  // and ditto but for trigger by keyboard hotkey instead (falls back to link):
  GitHub.Commits.link = AOP_wrap_around(try_scroll_first, GitHub.Commits.link);

  init_config();

  $('<div class="pagination" style="margin: 0; padding: 0;"></div>')
    .prependTo('#commit .separator:first');
  $('<a class="download_all" '+ hot +'="d"><u>d</u>ecorate all</a>')
    .appendTo('.pagination').click(download_all);
  $('<a class="fold_unfold" '+ hot +'="f"><u>f</u>old all</a>')
    .appendTo('.pagination');
  $('.fold_unfold').toggle(unfold_all, fold_all);

  // export to public identifiers for the hotkeys
  window.toggle_selected_folding = toggle_selected_folding;
  window.toggle_all_folding      = toggle_all_folding;
  window.download_selected       = download_selected;
  window.download_all            = download_all;
  location.href = 'javascript:$.hotkeys(' +
    '{ f: toggle_selected_folding' +
  //', F: toggle_all_folding' +
    ', d: download_selected' +
  //', D: download_all' +
    '});' + // adds our own hotkeys
    'delete GitHub.Commits.elements;' + // makes j / k span demand-loaded pages
    'GitHub.Commits.__defineGetter__("elements",' +
        'function() { return $(".commit"); });void 0';

  setTimeout(function() { AOP_also_call('$.facebox.reveal', show_docs); }, 1e3);
  LEAVE('init');
}

// fetch some API resource by api
function github_api(path, cb) {
  function get() {
    if (1 === enqueue().length) {
      if (DEV_MODE) console.warn('github_api: ', path);
      $.ajax(request);
    }
  }
  function enqueue() {
    var queue = github_api[path] = github_api[path] || [];
    queue.push(cb); // always modify in place for dispatch
    return queue;
  }
  function dispatch(queue, args) {
    for (var i = 0, cb; cb = queue[i]; i++)
      cb.apply(this, args || []);
  }
  var logged_in = github_api.token || $('#header a[href="/logout"]').length
    , request =
    { url: path
    , success: function done() {
        dispatch(github_api[path], arguments);
        delete   github_api[path];
      }
    , dataType: 'json'
    , beforeSend: logged_in && function(xhr) {
        var name = $('#header .avatarname .name').text()
          , auth = btoa(name+'/token:'+ github_api.token);
        xhr.setRequestHeader('Authorization', 'Basic '+ auth);
      }
    };
  if (!logged_in || github_api.token)
    get();
  else if (github_api.pending_token)
    github_api.pending_token.push(get);
  else {
    github_api.pending_token = [get];
    if (DEV_MODE) console.warn('github_api: ', path, ' - fetching token');
    $.ajax({ url: '/account/admin'
           , beforeSend: function(xhr) { xhr.withCredentials = true; }
           , success: function(html) {
               var got = html.match(/API token is <code>([^<]*)/);
               if (got) {
                 github_api.token = got[1];
                 dispatch(github_api.pending_token);
                 delete   github_api.pending_token;
               }
             }
           });
  }
}

// calls cb({ tag1: hash1, ... }, '/repo/name') after fetching the repo's tags,
// of if none, no_tags('/repo/name')
function get_tags(cb, no_tags, refresh) {
  return get_named('tags', cb, no_tags, refresh);
}

// calls cb({ branch: hash1, ... }, '/repo/name') or, no_branches('/repo/name')
// (just like get_tags)
function get_branches(cb, no_branches, refresh) {
  return get_named('branches', cb, no_branches, refresh);
}

function get_named(what, cb, no_cb, refresh) {
  function got_names(names) {
    // cache the repository's tags/branches for later
    var json = window.localStorage[path] = JSON.stringify(names = names[what]);
    if (json.length > 2)
      cb(names, repo);
    else
      no_cb && no_cb(repo);
  }
  function get_name() { return this.textContent.replace(/ \u2713$/, ''); }

  var repo = window.location.pathname.match(/^(?:\/[^\/]+){2}/);
  if (repo) repo = repo[0]; else return false;

  var path = what + repo
    , xxxs = window.localStorage[path] && JSON.parse(window.localStorage[path])
    , _css = '.subnav-bar '+ (what === 'tags' ? 'li + li' : 'li:first-child')
    , page = $(_css + ' a.dropdown + ul > li').map(get_name).get().sort() || []
    , have = xxxs && keys(xxxs).sort() || []
    , at_b = 'branches' === what && get_current_branch();

  // invalidate the branch cache if we're at the head of a branch, and its hash
  // contradicts what we have saved
  if (!xxxs || at_b && xxxs[at_b] !== get_first_commit_hash()) refresh = true;

  // optimization - if there are no tags in the page, don't go fetch any
  if ('tags' === what && !page.length) {
    have = page;
    xxxs = {};
    refresh = false;
  }

  // assume the repo still has no names if it didn't at the time the page loaded
  if (page.length === 0)
    no_cb && no_cb(repo);
  // assume the cache is still good if it's got the same tag number and names
  else if (!refresh &&
           have.length === page.length &&
           have.join() === page.join())
    cb(xxxs, repo);
  else { // refresh the cache
    github_api('/api/v2/json/repos/show'+ repo +'/'+ what, got_names);
    return true;
  }
  return false;
}

function get_current_branch() {
  return $('.subnav-bar li:first-child ul li strong').text().slice(0, -2);
}

function get_first_commit_hash() {
  return $('#commit .commit .machine a['+ hot +'="c"]')[0].pathname.slice(-40);
}

// annotates commits with tag/branch names in little bubbles on the right side
function inject_commit_names() {
  function draw_names(type, names, repo) {
    var all_names = keys(names)
      , kin_cache = {}; // kin_re => [all names matching kin_re]
    all_names.sort().forEach(function(name) {
      var hash = names[name]
        , url  = repo +'/commits/'+ name
        , sel  = 'a.'+ type +'[href="'+ url +'"]'
        , $a   = $('.commit pre > a[href$="'+ repo +'/commit/'+ hash +'"]');
      if (!$a.parent().find(sel).length) { // does the commit exist in the page?
        $(sel).remove(); // remove tag / branch from prior location (if any)
        $a.before('<a class="magic '+type+'" href="'+ url +'">'+ name +'</a>');

        // if we just linked a tag, also link a tag changeset, if applicable:
        if (type !== 'tag') return;
        var kin_re   = quote_re(name).replace(/\d+/g, '\\d+')
          , similar  = new RegExp(kin_re)
          , kin_tags = kin_cache[similar] = kin_cache[similar] ||
                     ( all_names
                         .filter(function(tag) { return similar.test(tag); })
                         .sort(dwim_sort_func)
                     )
          , this_idx = kin_tags.indexOf(name)
          , last_tag = this_idx && kin_tags[this_idx - 1];
        if (last_tag)
          $a.before( '<a class="magic tag diff" title="Changes since '+ last_tag
                   + '" href="'+ repo +'/compare/'+ last_tag +'...'+ name +'">'
                   + '&Delta;</a>'
                   );
      }
    });
  }
  function draw_tags(tags, repo) {
    draw_names('tag', tags, repo);
  }
  function draw_branches(branches, repo) {
    draw_names('branch', branches, repo);
  }
  var refresh = get_branches(draw_branches);
  // assume it's best to refresh tags too if any branches were moved
  get_tags(draw_tags, null, refresh);
}

function quote_re( re ) {
  return re.replace( /([.*+^$?(){}|\x5B-\x5D])/g, "\\$1" ); // 5B-5D == [\]
}

// example usage: ['0.10', '0.9'].sort(dwim_sort_func) comes out ['0.9', '0.10']
function dwim_sort_func(a, b) {
  if (a === b) return 0;
  var int_str_rest_re = /^(\d*)(\D*)(.*)/
    , A = int_str_rest_re.exec(a), a_int, a_str, a_int_len = A[1].length
    , B = int_str_rest_re.exec(b), b_int, b_str, b_int_len = B[1].length
    ;
  if (!a_int_len ^ !b_int_len) return a_int_len ? -1 : 1;
  do {
    if ((a_int = A[1]) !==
        (b_int = B[1])) {
      if ((a_int = parseInt(a_int, 10)) !==
          (b_int = parseInt(b_int, 10)))
        return a_int < b_int ? -1 : 1;
    }

    if ((a_str = A[2]) !==
        (b_str = B[2]))
      return a_str < b_str ? -1 : 1;

    a = A[3];
    b = B[3];
    if (!a.length) return b.length ? -1 : 0;
    if (!b.length) return a.length ? 1 : 0;

    A = int_str_rest_re.exec(a);
    B = int_str_rest_re.exec(b);
  } while (true);
}

// make all commits get @id:s c_<hash>, and all parent links get @rel="<hash>"
function prep_parent_links() {
  function hash(a) {
    return a.pathname.slice(a.pathname.lastIndexOf('/') + 1);
  }
  $('.commit:not([id]) a[href]['+ hot +'="p"]').each(function reroute() {
    $(this).attr('rel', hash(this));
  });
  $('.commit:not([id]) a[href]['+ hot +'="c"]').each(function set_id() {
    var id = hash(this), ci = $(this).closest('.commit'), pr = ci.prev();
    if (pr.find('a['+ hot +'="p"][href$='+ id +']').length)
      pr.addClass('adjacent');
    ci.attr('id', 'c_' + id);
  });
}

function try_scroll_first(wrappee, link_type) {
  function normal() { return wrappee.apply(self, args); }
  var args = _slice.call(arguments, 1), self = this;
  if (link_type !== 'p') return normal();

  var link = GitHub.Commits.selected().find('['+ hot +'="'+ link_type +'"]')[0];
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

// FIXME: integrate with the features blob
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
  for (var name in features) {
    var feature = features[name]
      , enabled = feature.enabled =
                  feature.always_enabled || !!window.localStorage.getItem(name);
    if (enabled) $('body').addClass(name);

    if (feature.toggle_selector)
      $(feature.toggle_selector)
        .live('click', { option: name }, toggle_option)
        .live('hover', { option: name }, show_docs_for)
      ;
  }
}

// an "option toggle" element in the page was clicked; make it so!
function toggle_option(e) {
  var name    = e.data.option
    , feature = features[name];

  if ((feature.enabled = !window.localStorage.getItem(name)))
    window.localStorage.setItem(name, '1');
  else
    window.localStorage.removeItem(name);

  if (feature.toggle_callback)
    feature.toggle_callback(feature.enabled);

  $('body').toggleClass(name);
  show_docs_for.apply(this, arguments);

  return false; // capture the click so it doesn't also cause a fold or unfold
}

function show_docs_for(e) {
  var name  = e.data.option
    , state = !!window.localStorage.getItem(name)
    , other = state ? 'off' : 'on'
    , title = 'Click to toggle option "'+ name.replace(/_/g, ' ') +'" '+ other;
  $(features[name].toggle_selector)
    .css('cursor', 'pointer')
    .attr('title', title);
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
  if (isNotLeftButton(e) ||
      $(e.target).closest('a[href], .changeset, .gravatar').length)
    return; // clicked a link, or in the changeset; don't do fold action

  // .magic and *# links aren't github commit links (but stuff we added)
  var $link = $('.message a[href^="/"][href*="/commit/"]'+ plain, this);
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
  var args = JSON.stringify(_slice.call(arguments, 1)).slice(1, -1);
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

var _slice = Array.prototype.slice;
function array(ish) {
  return _slice.call(ish, 0);
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

  // find all diff links and fix them, annotate how many files were changed, and
  // insert line 2.. of the commit message in the unfolded view of the changeset
  function post_process() {
    github_inlined_comments(this);

    var files = changeset.find('[id^="diff-"]').each(fix_link), line2
      , diffs = features.change_counts_for_folded_commits_too;
    if (diffs.enabled) diffs.show_diff(commit);

    // now, add lines 2.. of the commit message to the unfolded changeset view
    var whole = $('#commit', changeset); // contains the whole commit message
    try {
      if ((line2 = $('.message pre', whole).html().replace(line1, ''))) {
        $('.human .message pre', commit).append(
          $('<span class="full"></span>').html(line2)); // commit message
        $('.human .message pre a.loaded:last-child' + plain, commit).after(
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
    return wrapper.apply(this, [wrappee].concat(array(arguments)));
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

function on_dom_change(selector, cb) {
  function pause_to_tweak_dom() {
    $(selector).unbind('DOMSubtreeModified', wrapped_callback);
    try { cb(); } catch(e) {};
    $(selector).bind('DOMSubtreeModified', wrapped_callback);
  }
  var wrapped_callback = when_settled(pause_to_tweak_dom);
  $(selector).bind('DOMSubtreeModified', wrapped_callback);
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
    waiter = setTimeout(is_settled, ms);
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
  if ('undefined' == typeof __UNFOLD_IN_PAGE_SCOPE__) { // unsandbox, please!
    var src = exit_sandbox + '',
     script = document.createElement('script');
    script.setAttribute('type', 'application/javascript');
    script.innerHTML = 'const __UNFOLD_IN_PAGE_SCOPE__ = true;\n('+ src +')();';
    document.documentElement.appendChild(script);
    document.documentElement.removeChild(script);
  } else { // unsandboxed -- here we go!
    init();
  }
}

})();
