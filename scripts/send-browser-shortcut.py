#!/usr/bin/env python3
"""Send Ctrl+Shift+E through XTest for headed Linux browser qualification."""

from __future__ import annotations

import ctypes
import ctypes.util
import os
import subprocess
import sys
import time

if not os.environ.get("DISPLAY"):
    raise SystemExit("DISPLAY is not set")

x11_name = ctypes.util.find_library("X11")
xtst_name = ctypes.util.find_library("Xtst")
if not x11_name or not xtst_name:
    raise SystemExit("X11/XTest libraries are unavailable")

x11 = ctypes.CDLL(x11_name)
xtst = ctypes.CDLL(xtst_name)
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XQueryTree.argtypes = [
    ctypes.c_void_p,
    ctypes.c_ulong,
    ctypes.POINTER(ctypes.c_ulong),
    ctypes.POINTER(ctypes.c_ulong),
    ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)),
    ctypes.POINTER(ctypes.c_uint),
]
x11.XQueryTree.restype = ctypes.c_int
x11.XGetGeometry.argtypes = [
    ctypes.c_void_p,
    ctypes.c_ulong,
    ctypes.POINTER(ctypes.c_ulong),
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_uint),
    ctypes.POINTER(ctypes.c_uint),
    ctypes.POINTER(ctypes.c_uint),
    ctypes.POINTER(ctypes.c_uint),
]
x11.XGetGeometry.restype = ctypes.c_int
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XFree.argtypes = [ctypes.c_void_p]
xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeKeyEvent.restype = ctypes.c_int

display = x11.XOpenDisplay(None)
if not display:
    raise SystemExit("Unable to open X display")

try:
    root = x11.XDefaultRootWindow(display)
    root_return = ctypes.c_ulong()
    parent_return = ctypes.c_ulong()
    children = ctypes.POINTER(ctypes.c_ulong)()
    child_count = ctypes.c_uint()
    target = root
    if x11.XQueryTree(
        display,
        root,
        ctypes.byref(root_return),
        ctypes.byref(parent_return),
        ctypes.byref(children),
        ctypes.byref(child_count),
    ):
        largest_area = 0
        try:
            for index in range(child_count.value):
                child = children[index]
                geometry_root = ctypes.c_ulong()
                x = ctypes.c_int()
                y = ctypes.c_int()
                width = ctypes.c_uint()
                height = ctypes.c_uint()
                border = ctypes.c_uint()
                depth = ctypes.c_uint()
                if not x11.XGetGeometry(
                    display,
                    child,
                    ctypes.byref(geometry_root),
                    ctypes.byref(x),
                    ctypes.byref(y),
                    ctypes.byref(width),
                    ctypes.byref(height),
                    ctypes.byref(border),
                    ctypes.byref(depth),
                ):
                    continue
                area = width.value * height.value
                if area > largest_area:
                    largest_area = area
                    target = child
        finally:
            if children:
                x11.XFree(children)
    x11.XRaiseWindow(display, target)
    x11.XSetInputFocus(display, target, 1, 0)
    x11.XFlush(display)
    time.sleep(0.2)
    debug_path = os.environ.get("EDIS_E2E_X11_SCREENSHOT")
    if debug_path:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "x11grab", "-video_size", "1280x1024", "-i", os.environ["DISPLAY"], "-frames:v", "1", debug_path], check=False)

    names = [b"Control_L", b"Shift_L", b"e"]
    keycodes = [x11.XKeysymToKeycode(display, x11.XStringToKeysym(name)) for name in names]
    if any(code == 0 for code in keycodes):
        raise SystemExit("Unable to resolve shortcut keycodes")
    for code in keycodes:
        if xtst.XTestFakeKeyEvent(display, code, 1, 0) == 0:
            raise SystemExit("XTest key press failed")
        time.sleep(0.03)
    for code in reversed(keycodes):
        if xtst.XTestFakeKeyEvent(display, code, 0, 0) == 0:
            raise SystemExit("XTest key release failed")
        time.sleep(0.03)
    x11.XFlush(display)
finally:
    x11.XCloseDisplay(display)

sys.exit(0)
