Pod::Spec.new do |s|
  s.name = 'TdLib'
  s.version = '1.8.66'
  s.summary = 'TDLib JSON client for Chatus iOS'
  s.description = 'Local TDLib XCFramework built from the pinned official TDLib source.'
  s.homepage = 'https://core.telegram.org/tdlib'
  s.license = { :type => 'BSL-1.0' }
  s.author = { 'Telegram' => 'support@telegram.org' }
  s.platform = :ios, '15.1'
  s.source = { :path => '.' }
  s.public_header_files = 'include/**/*.h'
  s.header_mappings_dir = 'include'
  s.source_files = 'include/**/*.h'
  s.preserve_paths = 'libtdjson.xcframework'
  s.libraries = 'c++', 'tdjson'
  s.vendored_libraries = 'libtdjson.xcframework/ios-arm64/libtdjson.dylib'
  s.xcconfig = {
    'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks',
  }
end
