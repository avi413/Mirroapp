#include <napi.h>

// Placeholder for Canon EDSDK binding.

Napi::Value Initialize(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), true);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("initialize", Napi::Function::New(env, Initialize));
  return exports;
}

NODE_API_MODULE(camera, Init)
