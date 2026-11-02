# PA4 - A-Frame VR Scene

Student ID: 241482

## Variant

Theme: Underwater Research Base

Motion: Pulse

Interaction: Gaze cursor with 1.5 second fuse

Layout: Corridor with two rows of three exhibits

Component prefix: x1482-

## Scene

The project is an underwater research base with six exhibits:

1. Water Sample
2. Sea Rock Sample
3. Research Box
4. Air Tank
5. Sea Plant Sample
6. Observation Buoy

The scene includes a ground plane, sky, fog, ambient light and directional light.

The Research Box is created with a generic a-entity using geometry and material components.

## Controls

W, A, S, D - move around the scene

Mouse - look around

Gaze cursor - look at an exhibit for 1.5 seconds to select it

M - pause or continue exhibit motion

X - remove the selected exhibit

Enter VR - start VR mode when supported

## Custom Components

x1482-motion - makes the exhibits pulse.

x1482-texture - applies image textures.

x1482-exhibit - handles exhibit selection.

x1482-gallery - manages the exhibits and keyboard controls.

## Textures

The project uses three CC0 textures from Poly Haven.

### Metal

Corrugated Iron 03  
Source: Poly Haven  
Author: Charlotte Baglioni  
License: CC0  
File in project: textures/metal.jpg

### Rock

Rock 01  
Source: Poly Haven  
Author: Rob Tuytel  
License: CC0  
File in project: textures/rock.jpg

### Concrete

Concrete Floor 03  
Source: Poly Haven  
Authors: Matterfield Photography and Rob Tuytel  
License: CC0  
File in project: textures/concrete.jpg