//
// Use this file to import your target's public headers that you would like to expose to Swift.
//

#if __has_include(<LivekitReactNative/LivekitReactNative.h>)
#import <LivekitReactNative/LivekitReactNative.h>
#elif __has_include("LivekitReactNative.h")
#import "LivekitReactNative.h"
#endif

#if __has_include(<td/telegram/td_json_client.h>)
#import <td/telegram/td_json_client.h>
#endif

// Swift needs these declarations at compile time. Keep them here as a fallback
// because TDLib headers are generated/downloaded outside git before pod install.
#ifdef __cplusplus
extern "C" {
#endif

void *td_json_client_create(void);
void td_json_client_send(void *client, const char *request);
const char *td_json_client_receive(void *client, double timeout);
void td_json_client_destroy(void *client);

#ifdef __cplusplus
}
#endif
