#ifndef _SHIM_STRING_H
#define _SHIM_STRING_H
typedef unsigned long size_t;
size_t strlen(const char*);
char*  strchr(const char*, int);
void*  memset(void*, int, size_t);
void*  memcpy(void*, const void*, size_t);
#endif
