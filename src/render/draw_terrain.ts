import StencilMode from '../gl/stencil_mode';
import DepthMode from '../gl/depth_mode';
import {terrainUniformValues, terrainCoordsUniformValues} from './program/terrain_program';
import type Painter from './painter';
import type TerrainSourceCache from '../source/terrain_source_cache';
import type Tile from '../source/tile';
import CullFaceMode from '../gl/cull_face_mode';
import Texture from './texture';
import Color from '../style-spec/util/color';
import ColorMode from '../gl/color_mode';

const FBOs = {};

function drawTerrainCoords(painter, sourceCache: TerrainSourceCache) {
   const context = painter.context;
   const gl = context.gl;
   const colorMode = ColorMode.unblended;
   const program = painter.useProgram('terrainCoords');
   const depthMode = new DepthMode(gl.LEQUAL, DepthMode.ReadWrite, [0, 1]);
   const mesh = sourceCache.getTerrainMesh(context);
   const coords = sourceCache.getCoordsTexture(context);

   // draw tile-coords into framebuffer
   context.bindFramebuffer.set(sourceCache.getCoordsFramebuffer(painter).framebuffer);
   context.viewport.set([0, 0, painter.width  / devicePixelRatio, painter.height / devicePixelRatio]);
   context.clear({ color: Color.transparent, depth: 1 });

   sourceCache._coordsIndex = [];
   for (const tile of sourceCache.getRenderableTiles(painter.transform)) {
      const dem = sourceCache.getDem(tile.tileID);
      context.activeTexture.set(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, coords.texture);
      context.activeTexture.set(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, dem.texture);
      const posMatrix = painter.transform.calculatePosMatrix(tile.tileID.toUnwrapped());
      const uniformValues = terrainCoordsUniformValues(painter, posMatrix, dem.matrix, 255 - sourceCache._coordsIndex.length, dem.unpackVector, sourceCache.elevationOffset);
      program.draw(context, gl.TRIANGLES, depthMode, StencilMode.disabled, colorMode, CullFaceMode.backCCW, uniformValues, "terrain", mesh.vertexBuffer, mesh.indexBuffer, mesh.segments);
      sourceCache._coordsIndex.push(tile.tileID.key);
   }

   context.bindFramebuffer.set(null);
   context.viewport.set([0, 0, painter.width, painter.height]);
   sourceCache.updateCoordsIndexTexture(context);
}

function drawTerrain(painter: Painter, sourceCache: TerrainSourceCache, tile: Tile) {
   const context = painter.context;
   const gl = context.gl;
   const colorMode = painter.colorModeForRenderPass();
   const depthMode = new DepthMode(gl.LEQUAL, DepthMode.ReadWrite, painter.depthRangeFor3D);
   const program = painter.useProgram('terrain');
   const mesh = sourceCache.getTerrainMesh(context);
   const dem = sourceCache.getDem(tile.tileID);

   context.bindFramebuffer.set(null);
   context.viewport.set([0, 0, painter.width, painter.height]);
   context.activeTexture.set(gl.TEXTURE0);
   gl.bindTexture(gl.TEXTURE_2D, FBOs[tile.tileSize].colorAttachment.get());
   context.activeTexture.set(gl.TEXTURE1);
   gl.bindTexture(gl.TEXTURE_2D, dem.texture);
   const posMatrix = painter.transform.calculatePosMatrix(tile.tileID.toUnwrapped());
   const uniformValues = terrainUniformValues(painter, posMatrix, dem.matrix, dem.unpackVector, sourceCache.elevationOffset);
   program.draw(context, gl.TRIANGLES, depthMode, StencilMode.disabled, colorMode, CullFaceMode.backCCW, uniformValues, "terrain", mesh.vertexBuffer, mesh.indexBuffer, mesh.segments);
}

function prepareTerrain(painter: Painter, sourceCache: TerrainSourceCache, tile: Tile, stack: number) {
   const context = painter.context;
   const size = tile.tileSize * sourceCache.qualityFactor; // may increase rendering-size for better quality
   if (!tile.textures[stack]) {
      tile.textures[stack] = painter.getTileTexture(size)
         || new Texture(context, {width: size, height: size, data: null}, context.gl.RGBA);
      tile.textures[stack].bind(context.gl.LINEAR, context.gl.CLAMP_TO_EDGE);
   }
   // reuse a framebuffer from the framebuffer-stack and attach active texture
   if (!FBOs[tile.tileSize]) {
      FBOs[tile.tileSize] = context.createFramebuffer(size, size, true);
      FBOs[tile.tileSize].depthAttachment.set(context.createRenderbuffer(context.gl.DEPTH_COMPONENT16, size, size));
   }
   FBOs[tile.tileSize].colorAttachment.set(tile.textures[stack].texture);
   context.bindFramebuffer.set(FBOs[tile.tileSize].framebuffer);
}

export {
   prepareTerrain,
   drawTerrain,
   drawTerrainCoords
};