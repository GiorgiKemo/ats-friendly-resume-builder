"""Build the Paper Pal model used by the interactive homepage hero.

Run with Blender: blender --background --python scripts/build-paper-pal.py
Named shoulder/elbow/wrist pivots and glove morphs support lightweight runtime IK.
Append -- --preview C:/path/preview.png to render a posed asset inspection.
"""
from pathlib import Path
import math
import json
import sys
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public' / 'characters' / 'paper-pal.glb'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def material(name, color, roughness=.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*[linear(int(color[i:i+2], 16) / 255) for i in (0, 2, 4)], 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


paper = material('Warm white paper', 'ffffff', .7)
blue = material('ResumeATS royal blue', '2563eb', .35)
ink = material('Friendly ink eyes', '111827', .3)


def group(name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.parent = parent
    return obj


root = group('PaperPal')
head = group('PaperBody', root)


def finish(obj, name, mat, parent):
    obj.name = name
    obj.data.materials.append(mat)
    obj.parent = parent
    for polygon in getattr(obj.data, 'polygons', []):
        polygon.use_smooth = True
    return obj


def sphere(name, location, scale, mat, parent=head):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=location)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, name, mat, parent)


def curve(name, points, radius, mat, parent=head):
    data = bpy.data.curves.new(name, 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 4
    data.resolution_u = 16
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for vertex, point in zip(spline.bezier_points, points):
        vertex.co = point
        vertex.handle_left_type = 'AUTO'
        vertex.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, parent)


def beveled_box(name, location, dimensions, radius, mat, parent=head):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new('Soft paper edges', 'BEVEL')
    bevel.width = radius
    bevel.segments = 5
    obj.modifiers.new('Balanced normals', 'WEIGHTED_NORMAL')
    return finish(obj, name, mat, parent)


def capsule(name, start, end, radius, mat, parent):
    """A continuous round-ended arm segment, aligned along the local bone."""
    start, end = Vector(start), Vector(end)
    direction = end - start
    rotation = direction.to_track_quat('Z', 'Y')
    rings = [(radius * math.sin(i * math.pi / 12), -radius * math.cos(i * math.pi / 12)) for i in range(1, 7)]
    rings.append((radius, direction.length))
    rings += [(radius * math.cos(i * math.pi / 12), direction.length + radius * math.sin(i * math.pi / 12)) for i in range(1, 6)]
    vertices = [tuple(start + rotation @ Vector((0, 0, -radius)))]
    segments = 24
    for ring_radius, z in rings:
        for i in range(segments):
            theta = i * math.tau / segments
            vertices.append(tuple(start + rotation @ Vector((ring_radius * math.cos(theta), ring_radius * math.sin(theta), z))))
    top = len(vertices)
    vertices.append(tuple(start + rotation @ Vector((0, 0, direction.length + radius))))
    faces = [(0, 1 + (i + 1) % segments, 1 + i) for i in range(segments)]
    for ring in range(len(rings) - 1):
        offset = 1 + ring * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((offset + i, offset + j, offset + j + segments, offset + i + segments))
    offset = 1 + (len(rings) - 1) * segments
    faces += [(offset + i, offset + (i + 1) % segments, top) for i in range(segments)]
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, parent)


def apply_modifier(obj, modifier):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def glove(side, wrist, thumb_direction):
    """Fuse the anatomical volumes into one smooth surface, then curl its fingers."""
    parts = [sphere(side + 'PalmVolume', (0, 0, .104), (.102, .050, .094), blue, None)]
    finger_centers = (-.085, 0, .085)
    # The middle finger is longest, with a shorter little and index finger.
    finger_tops = (.292, .347, .315) if thumb_direction > 0 else (.315, .347, .292)
    for index, (x, top) in enumerate(zip(finger_centers, finger_tops)):
        parts.append(capsule(side + 'FingerVolume' + str(index), (x, -.004, .153), (x, -.004, top - .033), .033, blue, None))
    parts.append(capsule(side + 'ThumbVolume', (thumb_direction * .079, -.004, .105), (thumb_direction * .146, -.012, .198), .035, blue, None))
    parts.append(sphere(side + 'WristVolume', (0, 0, .016), (.057, .045, .050), blue, None))

    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    hand = bpy.context.object
    # Make every vertex wrist-local before union, so runtime bending stays simple.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    hand.name = side + 'Glove'
    hand.data.name = side + 'UnifiedGloveMesh'
    hand.data.materials.clear()
    hand.data.materials.append(blue)
    remesh = hand.modifiers.new('Unified glove surface', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = .0048
    remesh.use_smooth_shade = True
    apply_modifier(hand, remesh)
    smoothing = hand.modifiers.new('Soft glove transitions', 'SMOOTH')
    smoothing.factor = .82
    smoothing.iterations = 6
    apply_modifier(hand, smoothing)
    simplify = hand.modifiers.new('Compact glove topology', 'DECIMATE')
    simplify.ratio = .45
    apply_modifier(hand, simplify)
    smoothing = hand.modifiers.new('Smooth final glove surface', 'SMOOTH')
    smoothing.factor = .4
    smoothing.iterations = 2
    apply_modifier(hand, smoothing)
    for polygon in hand.data.polygons:
        polygon.use_smooth = True
    hand.parent = wrist
    hand.location = (0, 0, 0)
    hand.shape_key_add(name='Basis')

    # Bend along an arc towards the palm/front (-Y), preserving each cross section.
    # The union topology stays identical for open, grip and pointing states.
    index_finger = 2 if thumb_direction > 0 else 0
    def smoothstep(value, low, high):
        t = min(1, max(0, (value - low) / (high - low)))
        return t * t * (3 - 2 * t)

    for name in ('Grip', 'Point'):
        shape = hand.shape_key_add(name=name)
        for vertex, target in zip(hand.data.vertices, shape.data):
            co = vertex.co.copy()
            delta = Vector((0, 0, 0))
            if co.z > .178:
                weights = [math.exp(-((co.x - x) / .032) ** 2) for x in finger_centers]
                for index, weight in enumerate(weights):
                    if name == 'Point' and index == index_finger:
                        continue
                    length = finger_tops[index] - .178
                    distance = co.z - .178
                    curvature = 3.40 / length
                    angle = curvature * distance
                    bent = co.copy()
                    bent.y = -.004 - (1 - math.cos(angle)) / curvature + (co.y + .004) * math.cos(angle)
                    bent.z = .178 + math.sin(angle) / curvature + (co.y + .004) * math.sin(angle)
                    delta += (bent - co) * (weight / sum(weights))
            # Blend the shared index/thumb web smoothly; no seam or torn triangles.
            thumb_weight = smoothstep(thumb_direction * co.x, .105, .150)
            thumb_axis = Vector((thumb_direction * .067, 0, .093)).normalized()
            thumb_base = Vector((thumb_direction * .079, -.004, .105))
            thumb_distance = max(0, (co - thumb_base).dot(thumb_axis))
            thumb_curvature = 1.8 / .115
            thumb_angle = thumb_distance * thumb_curvature
            thumb_delta = thumb_axis * (math.sin(thumb_angle) / thumb_curvature - thumb_distance)
            thumb_delta.y = -(1 - math.cos(thumb_angle)) / thumb_curvature
            thumb_delta += thumb_axis * ((co.y + .004) * math.sin(thumb_angle))
            thumb_delta.y += (co.y + .004) * (math.cos(thumb_angle) - 1)
            target.co = co + delta * (1 - thumb_weight) + thumb_delta * thumb_weight
        shape.value = 0

    # A separate fitted cuff gives a clean wrist connection without extra fingers.
    cuff = beveled_box(side + 'GloveCuff', (0, 0, -.006), (.132, .105, .052), .020, blue, wrist)
    cuff.location = (0, 0, -.006)
    return hand


def move_pivot(obj, location):
    """Change only a group pivot, keeping all child visuals in place."""
    bpy.context.view_layer.update()
    child_world = [(child, child.matrix_world.copy()) for child in obj.children]
    obj.location = location
    bpy.context.view_layer.update()
    for child, matrix in child_world:
        child.matrix_world = matrix
    bpy.context.view_layer.update()


# A thin, rounded sheet with the upper-right corner cut for its curled fold.
outline = [(-.52, .45), (.52, .45), (.52, 1.63), (.28, 1.87), (-.52, 1.87)]
vertices = [(x, y, z) for y in (-.025, .065) for x, z in outline]
faces = [tuple(range(4, -1, -1)), tuple(range(5, 10))]
faces += [(i, (i + 1) % 5, (i + 1) % 5 + 5, i + 5) for i in range(5)]
mesh = bpy.data.meshes.new('Paper sheet mesh')
mesh.from_pydata(vertices, [], faces)
mesh.update()
body = bpy.data.objects.new('PaperSheet', mesh)
bpy.context.collection.objects.link(body)
finish(body, 'PaperSheet', paper, head)
bevel = body.modifiers.new('Rounded paper silhouette', 'BEVEL')
bevel.width = .035
bevel.segments = 5
body.modifiers.new('Paper normals', 'WEIGHTED_NORMAL')

# A single soft triangle folds inward from the cut diagonal corner.
fold = group('PaperFold', head)
vertices, faces = [], []
rows = 18
for row in range(rows + 1):
    t = row / rows
    base_x, base_z = .28 + .24 * t, 1.87 - .24 * t
    reach = .24 * (1 - abs(2 * t - 1))
    for column in range(9):
        s = column / 8
        vertices.append((base_x - reach * s * .5, -.045 - .065 * math.sin(s * math.pi), base_z - reach * s * .5))
for row in range(rows):
    for column in range(8):
        index = row * 9 + column
        faces.append((index, index + 1, index + 10, index + 9))
mesh = bpy.data.meshes.new('Curled corner mesh')
mesh.from_pydata(vertices, [], faces)
mesh.update()
curl = bpy.data.objects.new('CurledCorner', mesh)
bpy.context.collection.objects.link(curl)
fold_topology = bmesh.new()
fold_topology.from_mesh(mesh)
bmesh.ops.remove_doubles(fold_topology, verts=list(fold_topology.verts), dist=.000001)
bmesh.ops.recalc_face_normals(fold_topology, faces=list(fold_topology.faces))
fold_topology.to_mesh(mesh)
fold_topology.free()
finish(curl, 'CurledCorner', paper, fold)
solidify = curl.modifiers.new('Paper fold thickness', 'SOLIDIFY')
solidify.thickness = .024

beveled_box('BlueHeader', (-.06, -.035, 1.63), (.73, .025, .12), .018, blue)
for side, x in [('Left', -.18), ('Right', .18)]:
    sphere('Eye' + side, (x, -.071, 1.23), (.044, .033, .095), ink)
    curve('Brow' + side, [(x - .056, -.063, 1.43), (x, -.080, 1.456), (x + .055, -.063, 1.43)], .017, ink)
curve('Smile', [(-.145, -.073, 1.035), (0, -.082, .97), (.145, -.073, 1.035)], .020, ink)

for side, x, thumb_direction in [('Left', -.48, 1), ('Right', .48, -1)]:
    shoulder = group(side + 'Shoulder', root, (x, 0, 1.06))
    capsule(side + 'UpperArm', (0, 0, 0), (0, 0, .31), .045, blue, shoulder)
    elbow = group(side + 'Elbow', shoulder, (0, 0, .31))
    capsule(side + 'Forearm', (0, 0, 0), (0, 0, .29), .043, blue, elbow)
    wrist = group(side + 'Wrist', elbow, (0, 0, .29))
    glove(side, wrist, thumb_direction)

for side, x, toe in [('Left', -.25, -.31), ('Right', .25, .31)]:
    curve(side + 'Leg', [(x * .83, .018, .48), (x, .015, .30), (x, -.015, .14)], .063, blue, root)
    sphere(side + 'Boot', (toe, -.064, .095), (.16, .155, .09), blue, root)
    sphere(side + 'Cuff', (x, -.012, .17), (.09, .09, .055), blue, root)

move_pivot(fold, (.40, -.025, 1.75))
move_pivot(head, (0, 0, 1.12))

bpy.ops.object.select_all(action='SELECT')
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format='GLB', export_yup=True, export_apply=True, export_morph=True, export_animations=False)
print('Paper Pal exported:', OUTPUT.name)
print('Glove geometry:', json.dumps({side: {
    'vertices': len(bpy.data.objects[side + 'Glove'].data.vertices),
    'bounds': [list(min(v.co[a] for v in bpy.data.objects[side + 'Glove'].data.vertices) for a in range(3)), list(max(v.co[a] for v in bpy.data.objects[side + 'Glove'].data.vertices) for a in range(3))],
    'shape_keys': list(bpy.data.objects[side + 'Glove'].data.shape_keys.key_blocks.keys()),
} for side in ('Left', 'Right')}))


if '--preview' in sys.argv:
    preview = Path(sys.argv[sys.argv.index('--preview') + 1])
    # These inspection poses are applied after export; the GLB keeps neutral IK axes.
    bpy.data.objects['LeftShoulder'].rotation_euler.y = math.radians(-78)
    bpy.data.objects['RightShoulder'].rotation_euler.y = math.radians(62)
    bpy.data.objects['LeftElbow'].rotation_euler.y = math.radians(32)
    bpy.data.objects['RightElbow'].rotation_euler.y = math.radians(-42)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.world.color = (.7, .7, .7)
    scene.view_settings.view_transform = 'AgX'
    bpy.ops.object.camera_add(location=(2.5, -6.5, 2.8))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 1.10)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 2.75
    scene.camera = camera
    for location, power, size in [((-3, -4, 5), 450, 4), ((4, -2, 3), 250, 3), ((0, 3, 4), 350, 3)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(preview)
    bpy.ops.render.render(write_still=True)
    if '--gesture-preview' in sys.argv:
        bpy.data.objects['LeftGlove'].data.shape_keys.key_blocks['Point'].value = 1
        bpy.data.objects['RightGlove'].data.shape_keys.key_blocks['Grip'].value = 1
        scene.render.filepath = sys.argv[sys.argv.index('--gesture-preview') + 1]
        bpy.ops.render.render(write_still=True)
    if '--fist-preview' in sys.argv:
        for side in ('Left', 'Right'):
            keys = bpy.data.objects[side + 'Glove'].data.shape_keys.key_blocks
            keys['Point'].value = 0
            keys['Grip'].value = .95
        scene.render.filepath = sys.argv[sys.argv.index('--fist-preview') + 1]
        bpy.ops.render.render(write_still=True)
