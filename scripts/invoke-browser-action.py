#!/usr/bin/env python3
"""Invoke the pinned extension action through a real X11 mouse click.

This helper is test-only. The E2E profile pins the unpacked extension before
Chromium starts, then this script focuses the largest browser window and clicks
its pinned action icon. That produces the same browser-level user activation as
an actual toolbar click, including the temporary activeTab grant.
"""
from __future__ import annotations

import ctypes
import ctypes.util
import os
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
x11.XTranslateCoordinates.argtypes = [
    ctypes.c_void_p,
    ctypes.c_ulong,
    ctypes.c_ulong,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_int),
    ctypes.POINTER(ctypes.c_ulong),
]
x11.XTranslateCoordinates.restype = ctypes.c_int
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XResizeWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_uint, ctypes.c_uint]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
x11.XStringToKeysym.restype = ctypes.c_ulong
x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XKeysymToKeycode.restype = ctypes.c_uint
x11.XFree.argtypes = [ctypes.c_void_p]
xtst.XTestFakeMotionEvent.argtypes = [
    ctypes.c_void_p,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_ulong,
]
xtst.XTestFakeMotionEvent.restype = ctypes.c_int
xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
xtst.XTestFakeButtonEvent.restype = ctypes.c_int
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
    if not x11.XQueryTree(
        display,
        root,
        ctypes.byref(root_return),
        ctypes.byref(parent_return),
        ctypes.byref(children),
        ctypes.byref(child_count),
    ):
        raise SystemExit("Unable to enumerate X11 windows")

    target = 0
    target_width = 0
    target_height = 0
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
                target = child
                target_width = width.value
                target_height = height.value
                largest_area = area
    finally:
        if children:
            x11.XFree(children)

    if not target or target_width < 280 or target_height < 320:
        raise SystemExit("No usable browser window was found")

    root_x = ctypes.c_int()
    root_y = ctypes.c_int()
    translated_child = ctypes.c_ulong()
    if not x11.XTranslateCoordinates(
        display,
        target,
        root,
        0,
        0,
        ctypes.byref(root_x),
        ctypes.byref(root_y),
        ctypes.byref(translated_child),
    ):
        raise SystemExit("Unable to locate browser window")

    original_width = target_width
    original_height = target_height
    resized_for_toolbar = target_width < 800
    if resized_for_toolbar:
        target_width = 1280
        target_height = max(target_height, 700)
        x11.XResizeWindow(display, target, target_width, target_height)
        x11.XFlush(display)
        time.sleep(0.35)

    # The test profile pins exactly one unpacked extension. With Chromium's
    # standard toolbar, its center is 144px from the right edge and 72px from
    # the top of the browser window.
    click_x = root_x.value + target_width - 144
    click_y = root_y.value + 72

    x11.XRaiseWindow(display, target)
    x11.XSetInputFocus(display, target, 1, 0)
    x11.XFlush(display)
    time.sleep(0.2)

    if xtst.XTestFakeMotionEvent(display, -1, click_x, click_y, 0) == 0:
        raise SystemExit("XTest pointer motion failed")
    if xtst.XTestFakeButtonEvent(display, 1, 1, 0) == 0:
        raise SystemExit("XTest button press failed")
    time.sleep(0.08)
    if xtst.XTestFakeButtonEvent(display, 1, 0, 0) == 0:
        raise SystemExit("XTest button release failed")
    x11.XFlush(display)
    if os.environ.get("EDIS_E2E_KEEP_ACTION_OPEN") != "true":
        # Chromium renders the action popup as browser chrome, not as a
        # Playwright Page target. Keep the real action activation (and its
        # activeTab grant), then dismiss the chrome bubble when only the grant
        # is required.
        time.sleep(0.3)
        escape = x11.XKeysymToKeycode(display, x11.XStringToKeysym(b"Escape"))
        if escape == 0:
            raise SystemExit("Unable to resolve Escape keycode")
        if xtst.XTestFakeKeyEvent(display, escape, 1, 0) == 0:
            raise SystemExit("XTest Escape press failed")
        if xtst.XTestFakeKeyEvent(display, escape, 0, 0) == 0:
            raise SystemExit("XTest Escape release failed")
        if resized_for_toolbar:
            x11.XResizeWindow(display, target, original_width, original_height)
        x11.XFlush(display)
        if resized_for_toolbar:
            time.sleep(0.25)
finally:
    x11.XCloseDisplay(display)

sys.exit(0)
