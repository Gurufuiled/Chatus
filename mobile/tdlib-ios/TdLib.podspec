Pod::Spec.new do |s|
  s.name = 'TdLib'
  s.version = '1.8.52'
  s.summary = 'TDLib JSON client for Chatus iOS'
  s.description = 'Local TDLib XCFramework (prebuilt via npm run tdlib:fetch-ios).'
  s.homepage = 'https://core.telegram.org/tdlib'
  s.license = { :type => 'BSL-1.0' }
  s.author = { 'Telegram' => 'support@telegram.org' }
  s.platform = :ios, '15.1'
  s.source = { :path => '.' }
  s.vendored_frameworks = 'libtdjson.xcframework'
  s.public_header_files = 'include/**/*.h'
  s.header_mappings_dir = 'include'
  s.libraries = 'c++'
end
