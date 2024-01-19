import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r119/build/three.module.js';
import { OBJLoader } from 'https://threejsfundamentals.org/threejs/resources/threejs/r119/examples/jsm/loaders/OBJLoader.js';
import { RGBELoader } from 'https://threejsfundamentals.org/threejs/resources/threejs/r119/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'https://threejsfundamentals.org/threejs/resources/threejs/r119/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://threejsfundamentals.org/threejs/resources/threejs/r119/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://threejsfundamentals.org/threejs/resources/threejs/r119/examples/jsm/postprocessing/ShaderPass.js';

let targetPosition = new THREE.Vector3();
let targetPositionCurb = new THREE.Vector3();
let isMoving = false;
let selectedObject = null;
let isDragging = false;

let isTopView = false;
let originalCameraPosition = new THREE.Vector3();
let originalCameraQuaternion = new THREE.Quaternion();
let insideCarCameraPosition = new THREE.Vector3(0, 1, 0);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xabcdef);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight,0.1,1000);
const renderer = new THREE.WebGLRenderer();


const frustumSize = 5; 
const aspect = window.innerWidth / window.innerHeight;
const heightmapCamera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 1000);
heightmapCamera.position.set(0, 1.5, 50); 
heightmapCamera.lookAt(new THREE.Vector3(0, 0, 50));

const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

const grayscaleShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: `...`, 
  fragmentShader: `
    uniform sampler2D tDiffuse;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float gray = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
      gl_FragColor = vec4(gray, gray, gray, 1.0);
    }
  `
};

let activeCamera = camera;


function renderHeightmap() 
{
  renderer.setRenderTarget(renderTarget);
  renderer.render(scene, heightmapCamera);
  
  grayscaleShader.uniforms.tDiffuse.value = renderTarget.texture;

  const postProcessQuad = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(2, 2),
    new THREE.ShaderMaterial(grayscaleShader)
  );
  const postProcessScene = new THREE.Scene();
  postProcessScene.add(postProcessQuad);

  renderer.setRenderTarget(null);
  renderer.render(postProcessScene, new THREE.Camera());

  const size = window.innerWidth * window.innerHeight * 4;
  const buffer = new Uint8Array(size);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, window.innerWidth, window.innerHeight, buffer);
  const dataURL = bufferToDataURL('image/png', buffer, window.innerWidth, window.innerHeight);

  fetch('http://localhost:3000/receive-grayscale-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataURL.split(',')[1] })
  })
  .then(response => {
      if (response.ok) {
          console.log('Heightmap image sent successfully');
      } else {
          console.error('Failed to send heightmap image');
      }
  })
  .catch(error => {
      console.error('Error sending heightmap image:', error);
  });

  renderer.setRenderTarget(null);
}

function bufferToDataURL(type, buffer, width, height) {
  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;

  let imageData = ctx.createImageData(width, height);
  imageData.data.set(buffer);

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL(type);
}

const postProcessScene = new THREE.Scene();
const postProcessQuad = new THREE.Mesh(
  new THREE.PlaneBufferGeometry(2, 2),
  new THREE.ShaderMaterial(grayscaleShader)
);
postProcessScene.add(postProcessQuad);

function toggleCamera() {
  if (activeCamera === camera) {
    activeCamera = heightmapCamera;
  } else {
    activeCamera = camera;
  }
}

renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('scene-container').appendChild(renderer.domElement);
document
  .getElementById('scene-container')
  .addEventListener('wheel', onDocumentMouseWheel, false);

renderer.domElement.addEventListener('mousemove', OnDocumentMouseMove, false);
renderer.domElement.addEventListener('click', OnScreenClick, false);

renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

let interactableObjects = [];
let skybox;
camera.position.z = 10;

originalCameraPosition.copy(camera.position);
originalCameraQuaternion.copy(camera.quaternion);

let steeringPivot = 0;
let steeringWheelRotation = 0;

let targetPositionUser = new THREE.Vector3();
let targetPositionServer = new THREE.Vector3();

let editorEnabled = false;

const WheelsPositions = [
  { x: 1.175, y: 0.3, z: 0.9 }, // Sprednje levo kolo
  { x: -1.67, y: 0.3, z: 0.9 }, // Sprednje desno kolo
  { x: 1.175, y: 0.3, z: -0.9 }, // Zadnje levo kolo
  { x: -1.67, y: 0.3, z: -0.9 }, // Zadnje desno kolo
];

document.querySelector('.edit-button').addEventListener('click', () => {
  editorEnabled = !editorEnabled;
  if (editorEnabled) {
    console.log('Editor is now enabled.');
  } else {
    console.log('Editor is now disabled.');
    if (selectedObject) {
      RemoveAxisLines(selectedObject);
      selectedObject = null;
    }
    isDragging = false;
  }
});

let listenToServer = false;

document.getElementById('move-obstacle').addEventListener('click', () => {
  if (!listenToServer) {
    const targetX = parseFloat(document.getElementById('moveTo-x').value) || 0;
    targetPositionUser.set(targetX, 0, 0);
    isMoving = true;
  } else {
    console.log("Currently listening to server, 'Move To' is disabled.");
  }
});

document.querySelector('.listen-button').addEventListener('click', () => {
  listenToServer = !listenToServer;
  console.log(`Listening to server: ${listenToServer}`);
  if (!listenToServer) {
    targetPositionUser.copy(targetPositionServer);
  }
});

function moveToUserInput(x) {
  if (!listenToServer && models.obstacle) {
    targetPositionUser.setX(x);
    isMoving = true;
  }
}

function updateObstaclePosition(x) {
  if (models.obstacle) 
  {
    targetPositionServer.x = parseFloat(x);

    if (listenToServer) {
      isMoving = true;
    }
  } else {
    console.log('Obstacle not yet in scene, disregarding position update.');
  }
}


function fetchObstacleCoordinates() {
  fetch('http://localhost:3000/obstacle-coordinates')
    .then((response) => {
      if (!response.ok) {
        console.error('Network response was not ok:', response.statusText);
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then((data) => {
      console.log('Received data:', data);
      if (data.x !== undefined) {
        updateObstaclePosition(data.x);
      }
    })
    .catch((error) => console.error('Error fetching coordinates:', error));
  if (listenToServer) {
    isMoving = true;
  }
}

setInterval(fetchObstacleCoordinates, 10000);

function setupSteeringWheel() {
  if (!models.volan) {
    console.error('Volan model not loaded.');
    return;
  }

  steeringPivot = new THREE.Group();
  scene.add(steeringPivot);

  const volanBoundingBox = new THREE.Box3().setFromObject(models.volan);
  const volanCenter = volanBoundingBox.getCenter(new THREE.Vector3());

  steeringPivot.position.copy(volanCenter);

  if (models.volan.parent) {
    models.volan.parent.remove(models.volan);
  }
  steeringPivot.add(models.volan);

  models.volan.position.sub(volanCenter);
}

const models = {
  car: null,
  obstacle: null,
  environment: null,
  wheels: null,
  volan: null,
  windows: null,
  interior: null,
  retrovizor: null,
  floor: null,
  curb: null,
};

const ViewMode = {
  ORIGINAL: 'original',
  SIDE: 'side',
  TOP: 'top',
  REAR: 'rear',
  INSIDE_CAR: 'insideCar',
  CUSTOM: 'custom',
  ORBIT: 'custom',
};

let currentViewMode = ViewMode.ORIGINAL;

function setCameraView(viewMode) {
  if (!models.car) {
    return;
  }

  switch (viewMode) {
    case ViewMode.ORIGINAL:
      camera.position.copy(originalCameraPosition);
      camera.quaternion.copy(originalCameraQuaternion);
      break;
    case ViewMode.SIDE:
      camera.position.set(2, 6, 6);
      camera.lookAt(2, 0, 0);
      break;
    case ViewMode.TOP:
      camera.position.set(0, 10, 0);
      camera.lookAt(scene.position);
      break;
    case ViewMode.REAR:
      camera.position.set(-2, 7, 0);
      camera.lookAt(scene.position);
      break;
    case ViewMode.INSIDE_CAR:
      camera.position.set(
        models.car.position.x + insideCarCameraPosition.x - 1,
        models.car.position.y + insideCarCameraPosition.y,
        models.car.position.z + insideCarCameraPosition.z
      );

      camera.lookAt(
        new THREE.Vector3(
          camera.position.x + 1,
          camera.position.y,
          camera.position.z
        )
      );
      break;
    case ViewMode.ORBIT:
      camera.position.set(0, 250, 25);
      camera.lookAt(0, 0, 25);
      break;
    case ViewMode.CUSTOM:

      break;
  }
}

document.addEventListener('keypress', (e) => {
  switch (e.key) 
  {
    case '1':
      currentViewMode = ViewMode.ORIGINAL;
      break;
    case '2':
      currentViewMode = ViewMode.SIDE;
      break;
    case '3':
      currentViewMode = ViewMode.TOP;
      break;
    case '4':
      currentViewMode = ViewMode.REAR;
      break;
    case '5':
      currentViewMode = ViewMode.INSIDE_CAR;
      break;
    case '9':
      currentViewMode = ViewMode.CUSTOM;
      toggleCamera();
      if (activeCamera === heightmapCamera) 
      {
        setTimeout(() => renderHeightmap(), 0); 
      }
      break;
    case '0':
      currentViewMode = ViewMode.ORBIT;
      break;
  }
});

function onDocumentMouseWheel(event) {
  const zoomFactor = 0.05;

  camera.fov += event.deltaY * zoomFactor;
  camera.fov = Math.max(20, Math.min(160, camera.fov));
  camera.updateProjectionMatrix();
}

function OnScreenClick(event) {
  if (!editorEnabled) return;
  event.preventDefault();
  if (isDragging) {
    isDragging = false;
    if (selectedObject) {
      RemoveAxisLines(selectedObject);
    }
    selectedObject = null;
    return;
  }

  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(interactableObjects, true);

  if (intersects.length > 0) {
    let intersectedObject = intersects[0].object;
    selectedObject = intersectedObject;
    isDragging = true;
    console.log('Object clicked, adding axis lines');
    DrawAxisLines(selectedObject);
  }
}

function DrawAxisLines(object) {
  const axisLength = 10;
  const lineColor = new THREE.LineBasicMaterial({
    color: 0x0000ff,
    linewidth: 2,
  });
  lineColor.depthTest = false;
  lineColor.depthWrite = false;

  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(axisLength, 0, 0),
  ]);
  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, axisLength, 0),
  ]);
  const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, axisLength),
  ]);

  const xAxisLine = new THREE.Line(xAxisGeometry, lineColor);
  const yAxisLine = new THREE.Line(yAxisGeometry, lineColor);
  const zAxisLine = new THREE.Line(zAxisGeometry, lineColor);
  const scene = new THREE.Scene();

  const axisGroup = new THREE.Group();
  axisGroup.add(xAxisLine, yAxisLine, zAxisLine);

  object.add(axisGroup);
  console.log('axis lines added to object', axisGroup);
}

function RemoveAxisLines(object) {
  const axisGroup = object.children[object.children.length - 1];
  object.remove(axisGroup);
}

function OnDocumentMouseMove(event) {
  if (isDragging && selectedObject) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const planeNormal = isTopView
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
    const plane = new THREE.Plane(planeNormal, 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);

    selectedObject.position.copy(intersection);
  }
}

function setInsideCarView() {
  if (models.car) {
    camera.position.set(
      models.car.position.x + insideCarCameraPosition.x,
      models.car.position.y + insideCarCameraPosition.y,
      models.car.position.z + insideCarCameraPosition.z
    );

    camera.lookAt(
      new THREE.Vector3(
        camera.position.x + 1,
        camera.position.y,
        camera.position.z
      )
    );
  }
}

document.querySelectorAll('.clear-button').forEach((button) => {
  button.addEventListener('click', (event) => {
    const objectType = event.target.getAttribute('data-object-type');
    ClearObject(objectType);
  });
});

function ClearObject(modelType) {
  if (models[modelType]) {
    scene.remove(models[modelType]);
    models[modelType] = null;
    document.getElementById(modelType + '-x').value = '';
    document.getElementById(modelType + '-y').value = '';
    document.getElementById(modelType + '-z').value = '';
  }
}

document.addEventListener('keypress', (e) => {
  if (e.key === 'N' || e.key === 'n') {
    const inspector = document.getElementById('inspector');
    inspector.classList.toggle('visible');
  }
  if (e.key === 'k') {
    isTopView = !isTopView;
    if (isTopView) {
    } else {
      camera.position.copy(originalCameraPosition);
      camera.quaternion.copy(originalCameraQuaternion);
    }
  }
  if (e.key === 'i') {
    setInsideCarView();
  }
});

const heightMapShader = {
  vertexShader: `
    varying float vHeight;
    void main() {
      vHeight = position.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying float vHeight;
    void main() {
      float normalizedHeight = (vHeight - 0.0) / (8.0 - 0.0); // Normalizing height
      gl_FragColor = vec4(normalizedHeight, normalizedHeight, normalizedHeight, 1.0);
    }
  `
};

function LoadModel(fileInputId, modelType) 
{
  const fileInput = document.getElementById(fileInputId);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
      console.error('No file selected.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const contents = event.target.result;
      const objLoader = new OBJLoader();
      objLoader.load(contents, (object) => {
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) 
          {
            let material;
            if (modelType === 'curb') 
            {
              material = new THREE.MeshBasicMaterial({
                color: 0xa9a9a9,
              });
              child.scale.set(3, 3, 3);
            } 
            else if (modelType === 'floor') 
            {;
              material = new THREE.ShaderMaterial(heightMapShader);
            } 
            else if (modelType === 'windows') 
            {
              material = new THREE.MeshStandardMaterial({
                color: 0xaaaaaa,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
              });
            } 
            else 
            {
              material = new THREE.MeshBasicMaterial({
                color: 0x00ff00,
                side: THREE.DoubleSide,
              });
            }
            child.material = material;
            interactableObjects.push(child);
          }
        });

        if (models[modelType]) {
          scene.remove(models[modelType]);
        }
        models[modelType] = object;
        scene.add(object);
        if (modelType === 'curb' || modelType === 'floor') 
        {
          object.position.set(0, 0, 50);
        }
        UpdateModelPosition(modelType);
        if (modelType === 'volan') {
          setupSteeringWheel();
        }

        if (modelType === 'car') {
          const wheelPositions = [
            { x: 1.175, y: 0.3, z: 0.9 }, // Front left wheel
            { x: -1.67, y: 0.3, z: 0.9 }, // Front right wheel
            { x: 1.175, y: 0.3, z: -0.9 }, // Rear left wheel
            { x: -1.67, y: 0.3, z: -0.9 }  // Rear right wheel
          ];
          const wheelModels = ['tire_right.obj', 'tire_right.obj', 'tire_left.obj', 'tire_left.obj'];

          wheelModels.forEach((model, index) => {
            objLoader.load('3Dmodeli/' + model, (wheelObject) => {
              const wheelPivot = new THREE.Group();
              scene.add(wheelPivot);
              wheelPivot.add(wheelObject);

              const boundingBox = new THREE.Box3().setFromObject(wheelObject);
              const center = boundingBox.getCenter(new THREE.Vector3()).negate();
              wheelObject.position.copy(center);

              wheelPivot.position.set(wheelPositions[index].x, wheelPositions[index].y, wheelPositions[index].z);

              if (!models['wheels']) {
                models['wheels'] = new THREE.Group();
                scene.add(models['wheels']);
              }
              models['wheels'].add(wheelPivot);
              applyTextureToModel(wheelObject, '3Dmodeli/wheels/leftTire.png');
            });
          });
        }
      });
    };
    reader.readAsDataURL(file);
  });
}

function UpdateModelPosition(modelType) {
  const xInput = document.getElementById(modelType + '-x');
  const yInput = document.getElementById(modelType + '-y');
  const zInput = document.getElementById(modelType + '-z');

  if (models[modelType]) 
  {
    const x = xInput.value ? parseFloat(xInput.value) : models[modelType].position.x;
    const y = yInput.value ? parseFloat(yInput.value) : models[modelType].position.y;
    const z = zInput.value ? parseFloat(zInput.value) : models[modelType].position.z;

    models[modelType].position.set(x, y, z);
  }
}


function applyTextureToModel(model, texturePath) {
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(texturePath, function(texture) {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
        });
      }
    });
  });
}

function ApplyTexture(textureInputId, modelType) {
  const textureInput = document.getElementById(textureInputId);
  textureInput.addEventListener('change', (e) => {
    const textureFile = e.target.files[0];
    if (!textureFile) {
      console.error('No texture file selected.');
      return;
    }
    if (!models[modelType]) {
      alert('Please add a 3D model first.');
      return;
    }

    const textureReader = new FileReader();
    textureReader.onload = function (textureEvent) {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(textureEvent.target.result, function (texture) {
        models[modelType].traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = new THREE.MeshBasicMaterial({
              map: texture,
              side: THREE.DoubleSide,
            });
          }
        });
        renderer.render(scene, camera);
      });
    };
    textureReader.readAsDataURL(textureFile);
  });
}

function ApplyEmissionTexture(emissionTextureInputId, modelType) {
  const emissionTextureInput = document.getElementById(emissionTextureInputId);

  emissionTextureInput.addEventListener('change', (e) => {
    const emissionTextureFile = e.target.files[0];
    if (!emissionTextureFile) {
      console.error('No emission texture file selected.');
      return;
    }
    if (!models[modelType]) {
      alert('Please add a 3D model first.');
      return;
    }

    const emissionTextureReader = new FileReader();
    emissionTextureReader.onload = function (emissionTextureEvent) {
      const textureLoader = new THREE.TextureLoader();
      const emissionTexture = textureLoader.load(
        emissionTextureEvent.target.result
      );
      updateEmissionMaterial(modelType, emissionTexture);
    };
    emissionTextureReader.readAsDataURL(emissionTextureFile);
  });
}

function updateEmissionMaterial(modelType, emissionTexture) {
  const model = models[modelType];
  if (model) {
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        let meshMaterial = child.material;

        if (!(meshMaterial instanceof THREE.MeshStandardMaterial)) {
          meshMaterial = new THREE.MeshStandardMaterial();
        }

        meshMaterial.emissiveMap = emissionTexture;
        meshMaterial.emissive = new THREE.Color(0xffffff);
        meshMaterial.emissiveIntensity = 1;

        if (child.material.map) {
          meshMaterial.map = child.material.map;
        } else {
          meshMaterial.color.set(0xffffff);
        }

        child.material = meshMaterial;
      }
    });
    renderer.render(scene, camera);
  }
}

function setupPositionInputListeners(modelType) {
  const xInput = document.getElementById(modelType + '-x');
  const yInput = document.getElementById(modelType + '-y');
  const zInput = document.getElementById(modelType + '-z');

  xInput.addEventListener('input', () => UpdateModelPosition(modelType));
  yInput.addEventListener('input', () => UpdateModelPosition(modelType));
  zInput.addEventListener('input', () => UpdateModelPosition(modelType));
}

function rotateSkybox() {
  const xRotation = 0;
  const yRotation = Math.PI / 2;
  const zRotation = 0.15;
  if (skybox) {
    skybox.rotation.x = xRotation;
    skybox.rotation.y = yRotation;
    skybox.rotation.z = zRotation;
  }
}

function setupHDRI() {
  const rgbeLoader = new RGBELoader();
  rgbeLoader.load('HDRI/rusting.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    skybox = new THREE.Mesh(geometry, material);
    scene.add(skybox);

    rotateSkybox();
  });
}

window.onload = function () {
  setupHDRI();

  [
    'obstacle',
    'car',
    'environment',
    'wheels',
    'volan',
    'interior',
    'retrovizor',
    'windows',
    'floor',
    'curb'
  ].forEach((type) => {
    LoadModel(type + '-upload', type);
    ApplyTexture(type + '-texture-upload', type);
    setupPositionInputListeners(type);
  });

  ApplyEmissionTexture('car-emission-upload', 'car');

  document.getElementById('move-obstacle').addEventListener('click', () => {
    if (!listenToServer) {
      const targetX =
        parseFloat(document.getElementById('moveTo-x').value) || 0;
      targetPositionUser.set(targetX, 0, 0);
      isMoving = true;
    } else {
      console.log("Currently listening to server, 'Move To' is disabled.");
    }
  });
};

document.querySelector('.save-button').addEventListener('click', () => {
  const sceneData = {};

  Object.keys(models).forEach((key) => {
    const object = models[key];
    if (object) {
      sceneData[key] = {
        position: object.position.toArray(),
      };
    }
  });

  localStorage.setItem('sceneData', JSON.stringify(sceneData));
  console.log('Scene saved');
});

document.querySelector('.open-button').addEventListener('click', () => {
  const sceneDataStr = localStorage.getItem('sceneData');
  if (sceneDataStr) {
    const sceneData = JSON.parse(sceneDataStr);

    Object.keys(sceneData).forEach((key) => {
      const objectData = sceneData[key];
      const object = models[key];
      if (object) {
        object.position.fromArray(objectData.position);
      }
    });

    console.log('Scene opened');
  } else {
    console.log('No saved scene to open');
  }
});

function Animate()
{
  requestAnimationFrame(Animate);
  setCameraView(currentViewMode);
  renderer.render(scene, activeCamera);

  if (editorEnabled && isDragging && selectedObject) {
    const axisGroup =
      selectedObject.children[selectedObject.children.length - 1];
    if (axisGroup) {
      console.log('animating selected object');
      axisGroup.position.copy(selectedObject.position);
      console.log('axis position updated', axisGroup.position);
    }
  }

  if (isMoving && models.obstacle) {
    let obstacleTargetX = listenToServer
      ? targetPositionServer.x
      : targetPositionUser.x;

    let newTargetPosition = new THREE.Vector3(
      obstacleTargetX,
      models.obstacle.position.y,
      models.obstacle.position.z
    );
    models.obstacle.position.lerp(newTargetPosition, 0.05);

    let newTargetPositionCurb = new THREE.Vector3(
      obstacleTargetX,
      models.curb.position.y,
      models.curb.position.z
    );
    models.curb.position.lerp(newTargetPositionCurb, 0.05);

    if (models.obstacle.position.distanceTo(newTargetPosition) < 0.01) {
      models.obstacle.position.copy(newTargetPosition);
      models.curb.position.copy(newTargetPositionCurb);
      isMoving = false;
    }

    if (models.environment) {
      models.environment.position.x = models.obstacle.position.x;
    }
  }

  if (isMoving && models.volan) {
    rotateSteeringWheel();
  }

  // let rotationPoint = new THREE.Vector3(1.175, 0.3, 0.9); // Točka vrtenja, prilagodite glede na vaše potrebe
  // let rotationPoint = new THREE.Vector3(positions[0].x, positions[0].y, positions[0].z); // Točka vrtenja, prilagodite glede na vaše potrebe
  updateModelAndCamera(models['wheels']);
}

Animate();

document.addEventListener('keydown', handleToggle, false);

// Global variables for object rotation
var rotateObjectZ = 0; // Object rotation around Z-axis

function handleToggle(event) {
  document.addEventListener('keydown', handleObjectRotation, false);
  document.addEventListener('keyup', handleObjectRotationRelease, false);
}



function updateModelAndCamera(model) {
  if (model != null) {
    model.castShadow = true;
    model.receiveShadow = true;
    model.rotation.z += rotateObjectZ;
  }
}

function spinWheel(boolVar){
  var spinDirection = 0;
  if(boolVar){
    spinDirection = -1;
  }else{
    spinDirection = 1;
  }

  let rotationAxis = new THREE.Vector3(0, 0, 1); // Os za vrtenje (z os)
  if (models['wheels']) {
    models['wheels'].children.forEach((wheelPivot) => {
      let rotationPoint = wheelPivot.position.clone();
      rotateAboutPoint(wheelPivot, rotationPoint, rotationAxis, spinDirection*0.3); // Zavrti za 0.05 radianov
    });
  }
}

function rotateAboutPoint(obj, point, axis, theta, pointIsWorld) {
  pointIsWorld = pointIsWorld === undefined ? false : pointIsWorld;

  if (pointIsWorld) {
    obj.parent.localToWorld(obj.position); // kompenzacija za svetovne koordinate
  }

  obj.position.sub(point); // odstranimo zamik
  obj.position.applyAxisAngle(axis, theta); // zavrtimo POLOŽAJ
  obj.position.add(point); // ponovno dodamo zamik

  if (pointIsWorld) {
    obj.parent.worldToLocal(obj.position); // prekličemo kompenzacijo svetovnih koordinat
  }

  obj.rotateOnAxis(axis, theta); // zavrtimo OBJEKT
}

function handleObjectRotation(event) {
  switch (event.keyCode) {
    case 81: // Q - Rotate object counterclockwise around Z-axis
      spinWheel(false);
      break;
    case 69: // E - Rotate object clockwise around Z-axis
      spinWheel(true);
      break;
    case 80:
      rotateObject = false;
      break; // P key
    default:
      break;
  }
}

function handleObjectRotationRelease(event) {
  switch (event.keyCode) {
    case 81: // Q - Rotate object counterclockwise around Z-axis
      rotateObjectZ = 0;
      break;
    case 69: // E - Rotate object clockwise around Z-axis
      rotateObjectZ = 0;
      break;
    default:
      break;
  }
}

