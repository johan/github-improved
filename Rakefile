require 'etc'

RakeFileUtils.verbose_flag = false

task :default => 'github-improved.oex'

desc 'build everything'
task :all => %w(github-improved.oex)

desc 'cleanup'
task :clean do |t|
  verbose(true) { rm_rf FileList['build', 'github-improved.*'] }
end

desc 'opera extension'
file 'github-improved.oex' => FileList["opera/*", 'unfold_commit_history.user.js'] do |t|
  announce t
  rm_rf 'build'
  mkdir 'build'
  cp_r 'opera', 'build/opera'
  mkdir 'build/opera/includes'
  cp 'unfold_commit_history.user.js', 'build/opera/includes/'
  cd 'build/opera' do
    sh "zip -qrmD9 ../../github-improved.oex *"
  end
end

desc 'Chrome extension'
file 'github-improved.zip' => FileList["chrome/*",'unfold_*.user.js'] do |t|
  announce t
  rm_rf 'build'
  mkdir 'build'
  cp_r 'chrome', 'build/chrome'
  cp 'unfold_commit_history.user.js', 'build/chrome/'
  #build_zip t.name, 'build/chrome', 'chrome.pem'
  cp 'chrome.pem', 'build/chrome/key.pem'
  cd 'build' do
    rm_f 'chrome/.DS_Store'
    sh "zip -qrD9 ../github-improved.zip chrome"
  end
end

def announce(task, action = 'building')
  puts "#{action} #{task.name}"
end

def build_zip(zip_output, ex_dir, pkey)
  rm zip_output if File.exists? zip_output
  cp pkey, "#{ex_dir}/key.pem"
  cd 'build' do
    rm_f '.DS_Store'
    sh 'zip', '-qrD9', "../#{zip_output}", File.basename(ex_dir)
  end
  rm "#{ex_dir}/key.pem"
end
