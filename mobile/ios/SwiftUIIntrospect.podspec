Pod::Spec.new do |s|
  s.name         = 'SwiftUIIntrospect'
  s.version      = '1.3.0'
  s.license      = { :type => 'MIT' }
  s.homepage     = 'https://github.com/siteline/swiftui-introspect'
  s.authors      = 'David Roman'
  s.summary      = 'Introspect underlying UIKit/AppKit components from SwiftUI.'
  s.source       = {
    :http => 'https://github.com/siteline/swiftui-introspect/archive/refs/tags/1.3.0.tar.gz'
  }
  s.source_files = 'swiftui-introspect-1.3.0/Sources/**/*.swift'
  s.swift_version = '5.7'
  s.ios.deployment_target = '13.0'
  s.tvos.deployment_target = '13.0'
  s.osx.deployment_target = '10.15'
end
