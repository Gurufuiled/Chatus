#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(Tdlib, NSObject)

RCT_EXTERN_METHOD(sendClientJson:(NSString *)queryJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(addListener:(NSString *)eventName)
RCT_EXTERN_METHOD(removeListeners:(NSInteger)count)

@end
