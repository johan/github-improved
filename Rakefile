require 'etc'

RakeFileUtils.verbose_flag = false

task :default => 'github-improved.oex'

desc 'build everything'
task :all => %w(github-improved.oex)

desc 'cleanup'
task :clean do |t|
  verbose(true) { rm_rf FileList['build', 'github-improved.oex'] }
end

desc 'opera extension'
file 'github-improved.oex' => FileList["opera/*", 'unfold_commit_history.user.js'] do |t|
  rm_rf 'build'
  mkdir 'build'
  cp_r 'opera', 'build/opera'
  mkdir 'build/opera/includes'
  cp 'unfold_commit_history.user.js', 'build/opera/includes/'
  cd 'build/opera' do
    sh "zip -qrmD9 ../../github-improved.oex *"
  end
end

def announce(task, action = 'building')
  puts "#{action} #{task.name}"
end
