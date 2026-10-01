"""Render a Quaternius character animation with studio lighting on a transparent background.

blender -b <file.blend> --python render_character.py -- --action Victory --out <dir> [--frames 0-45] [--size 720] [--still 20]
"""
import argparse
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument("--action", default="Idle")
parser.add_argument("--out", required=True)
parser.add_argument("--frames", default="")
parser.add_argument("--size", type=int, default=720)
parser.add_argument("--still", type=int, default=-1)
parser.add_argument("--engine", default="EEVEE")
parser.add_argument("--yaw", type=float, default=-22.0)
parser.add_argument("--smooth", type=int, default=1)
parser.add_argument("--palette", default="casual")
parser.add_argument("--fit-action", default="Victory")
args = parser.parse_args(argv)

scene = bpy.context.scene

# Brand palette (sRGB hex -> linear for Principled BSDF).
def srgb(hex_value):
    hex_value = hex_value.lstrip("#")
    out = []
    for index in (0, 2, 4):
        c = int(hex_value[index:index + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)

RECOLOR = {
    "Shirt": srgb("#2563eb"),
    "Pants": srgb("#1e293b"),
    "Belt": srgb("#0f172a"),
    "Hair": srgb("#3b2a20"),
    "Skin": srgb("#e9b48f"),
    "Face": srgb("#1f1a17"),
}
if args.palette == 'suit':
    RECOLOR.update({
        'Black': srgb('#1e40af'),
        'Shirt': srgb('#f1f5f9'),
        'Details': srgb('#60a5fa'),
        'Belt': srgb('#0f172a'),
        'Hair': srgb('#3a2418'),
    })

for mat in bpy.data.materials:
    if not mat.node_tree:
        continue
    for bsdf in [n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"]:
        if mat.name in RECOLOR:
            base = bsdf.inputs["Base Color"]
            for link in list(base.links):
                mat.node_tree.links.remove(link)
            base.default_value = RECOLOR[mat.name]
        bsdf.inputs["Roughness"].default_value = 0.55
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.35
    if mat.name in RECOLOR:
        mat.diffuse_color = RECOLOR[mat.name]
    # The files ship a separate Cycles output wired to a plain Diffuse BSDF;
    # send every output through the (recolored) Principled BSDF instead.
    principled = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if principled:
        for output in [n for n in mat.node_tree.nodes if n.type == "OUTPUT_MATERIAL"]:
            mat.node_tree.links.new(principled.outputs[0], output.inputs["Surface"])

# Soft shading reads as a finished character rather than raw low-poly facets.
if args.smooth:
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            for poly in obj.data.polygons:
                poly.use_smooth = True

# Remove any cameras and lights that shipped with the file.
for obj in list(bpy.data.objects):
    if obj.type in {"CAMERA", "LIGHT"}:
        bpy.data.objects.remove(obj, do_unlink=True)

armature = next(obj for obj in bpy.data.objects if obj.type == "ARMATURE")
armature.animation_data_create()

def use_action(name):
    act = bpy.data.actions[name]
    armature.animation_data.action = act
    if hasattr(armature.animation_data, "action_slot") and act.slots:
        armature.animation_data.action_slot = act.slots[0]
    return act

# Frame the camera on the widest pose so every clip shares one framing.
fit = use_action(args.fit_action)
start, end = (int(v) for v in fit.frame_range)

# Character bounds across the clip, so the camera fits every pose.
meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for frame in range(start, end + 1, max(1, (end - start) // 8)):
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        for corner in evaluated.bound_box:
            world = evaluated.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, world.x), min(lo.y, world.y), min(lo.z, world.z)))
            hi = Vector((max(hi.x, world.x), max(hi.y, world.y), max(hi.z, world.z)))
center = (lo + hi) / 2
height = hi.z - lo.z

action = use_action(args.action)
start, end = (int(v) for v in action.frame_range)
if args.frames:
    start, end = (int(v) for v in args.frames.split("-"))
scene.frame_start, scene.frame_end = start, end
scene.render.fps = 30

# No ground plane: the page draws a soft contact shadow under the character.

# Camera: slight three-quarter view from just above chest height.
cam_data = bpy.data.cameras.new("Camera")
cam_data.lens = 60
camera = bpy.data.objects.new("Camera", cam_data)
scene.collection.objects.link(camera)
scene.camera = camera
yaw = math.radians(args.yaw)
distance = height * 1.9
target = Vector((center.x, center.y, lo.z + height * 0.5))
camera.location = target + Vector((math.sin(yaw) * distance, -math.cos(yaw) * distance, height * 0.18))
direction = target - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

def add_light(name, kind, energy, location, size=1.0, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.size = size
    light = bpy.data.objects.new(name, data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (target - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    return light

h = height
add_light("Key", "AREA", 140 * h * h, target + Vector((-1.6 * h, -1.8 * h, 1.6 * h)), size=1.6 * h, color=(1.0, 0.97, 0.92))
add_light("Fill", "AREA", 55 * h * h, target + Vector((1.9 * h, -1.4 * h, 0.4 * h)), size=2.2 * h, color=(0.85, 0.9, 1.0))
add_light("Rim", "AREA", 170 * h * h, target + Vector((0.9 * h, 1.8 * h, 1.4 * h)), size=1.0 * h, color=(0.75, 0.85, 1.0))

world = scene.world or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.82, 0.86, 0.95, 1)
background.inputs["Strength"].default_value = 0.4

scene.render.engine = "BLENDER_EEVEE" if args.engine == "EEVEE" else "CYCLES"
if args.engine != "EEVEE":
    scene.cycles.samples = 64
    scene.cycles.use_denoising = True
    # Render on the GPU: Cycles defaults to the CPU in background mode unless a
    # compute backend is enabled. Prefer OptiX (RTX), then CUDA.
    cycles_prefs = bpy.context.preferences.addons["cycles"].preferences
    gpu_backend = None
    for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            cycles_prefs.compute_device_type = backend
        except TypeError:
            continue
        cycles_prefs.refresh_devices()
        gpus = [device for device in cycles_prefs.devices if device.type == backend]
        if gpus:
            for device in cycles_prefs.devices:
                device.use = device.type == backend
            gpu_backend = backend
            break
    scene.cycles.device = "GPU" if gpu_backend else "CPU"
    if gpu_backend:
        scene.cycles.denoiser = "OPTIX" if gpu_backend == "OPTIX" else "OPENIMAGEDENOISE"
    print("CYCLES DEVICE", gpu_backend or "CPU", [d.name for d in cycles_prefs.devices if d.use])
scene.render.film_transparent = True
scene.render.resolution_x = args.size
scene.render.resolution_y = args.size
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
try:
    scene.eevee.taa_render_samples = 32
    scene.eevee.use_shadows = True
except AttributeError:
    pass

if args.still >= 0:
    scene.frame_set(args.still)
    scene.render.filepath = f"{args.out}/still.png"
    bpy.ops.render.render(write_still=True)
else:
    scene.render.filepath = f"{args.out}/frame_"
    bpy.ops.render.render(animation=True)
print("RENDERED", args.action, start, end, round(height, 3))
