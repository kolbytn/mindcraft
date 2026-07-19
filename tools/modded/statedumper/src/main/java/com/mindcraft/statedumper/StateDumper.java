package com.mindcraft.statedumper;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.StateDefinition;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.material.Material;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraftforge.event.server.ServerStartedEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;
import net.minecraftforge.registries.ForgeRegistries;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.FileWriter;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * StateDumper - a read-only, zero-registration Forge 1.19.2 mod.
 *
 * PURPOSE (Task B, Mindcraft / prismarine modded-block support):
 *   Dumps, for every block currently registered on this server (vanilla + all
 *   loaded mods), the exact global block-STATE ids the server uses when
 *   encoding chunk-section palettes on the wire. This is read directly from
 *   the live runtime IdMapper (`Block.BLOCK_STATE_REGISTRY`), so the output is
 *   byte-exact for THIS running instance - no need to reimplement Mojang's
 *   state-permutation/sorting algorithm on the Node.js side.
 *
 * CRITICAL SAFETY PROPERTY: this mod registers NOTHING (no blocks, items,
 * entities, registries). It only *reads* existing registries after they are
 * frozen (ServerStartedEvent fires after RegisterEvent processing and
 * registry freezing are complete). Because it adds zero registry entries, it
 * cannot perturb block-registration order or ids for any other mod - so the
 * ids captured here are identical to what they would be with this mod absent.
 * It is safe to add this mod jar to the mods folder, run the dump once, then
 * remove the jar again.
 *
 * OUTPUT: writes `./statedump/blockstates.json` (relative to the server run
 * directory, i.e. normally /data/statedump/blockstates.json in the itzg/forge
 * container) as a single JSON array, one object per registered Block.
 *
 * Schema per block entry:
 * {
 *   "id": <int>,                 // ForgeRegistries.BLOCKS numeric id (must match modded_registries.json's block.entries[].id)
 *   "name": "<namespace:path>",  // full registry name
 *   "properties": [ {"name": "...", "kind": "enum|bool|int", "values": ["...", ...]}, ... ],  // sorted by name (see below)
 *   "states": [
 *      { "globalId": <int>, "default": <bool>, "properties": {"name": "value", ...},
 *        "solidFullCube": <bool>, "collisionAABBs": [[minX,minY,minZ,maxX,maxY,maxZ], ...] },
 *      ...  // one entry per BlockState permutation of this block, in ascending globalId order
 *   ]
 * }
 *
 * NOTE ON "properties" ordering: Mojang's own StateDefinition.Builder stores
 * properties in an ImmutableSortedMap keyed by property name (alphabetical),
 * and generates the cartesian product of BlockStates with the LAST property
 * (alphabetically) varying fastest - this is the same order the vanilla F3
 * debug screen and /data block reports show block states in. We reproduce
 * that same alphabetical sort here purely for readability/cross-checking;
 * the authoritative value that matters is "globalId", which is read directly
 * from Block.BLOCK_STATE_REGISTRY and does NOT depend on us getting that
 * ordering right.
 */
@Mod(StateDumper.MODID)
public class StateDumper {
    public static final String MODID = "statedumper";
    private static final Logger LOGGER = LogManager.getLogger(MODID);

    public StateDumper() {
        net.minecraftforge.common.MinecraftForge.EVENT_BUS.register(this);
    }

    @SubscribeEvent
    public void onServerStarted(ServerStartedEvent event) {
        LOGGER.info("[statedumper] Server started - dumping block registry + block states...");
        try {
            dump(event.getServer().getServerDirectory().toPath());
        } catch (Throwable t) {
            LOGGER.error("[statedumper] Dump failed", t);
        }
    }

    private void dump(Path serverDir) throws Exception {
        Path outDir = serverDir.resolve("statedump");
        outDir.toFile().mkdirs();
        Path outFile = outDir.resolve("blockstates.json");

        JsonArray root = new JsonArray();
        int blockCount = 0;
        int stateCount = 0;
        int errorCount = 0;

        for (Block block : ForgeRegistries.BLOCKS.getValues()) {
            try {
                JsonObject blockObj = dumpBlock(block);
                root.add(blockObj);
                blockCount++;
                stateCount += blockObj.getAsJsonArray("states").size();
            } catch (Throwable t) {
                errorCount++;
                LOGGER.warn("[statedumper] Failed to dump block {}: {}",
                        ForgeRegistries.BLOCKS.getKey(block), t.toString());
            }
        }

        try (FileWriter w = new FileWriter(outFile.toFile())) {
            new GsonBuilder().create().toJson(root, w);
        }

        LOGGER.info("[statedumper] Wrote {} blocks / {} states ({} errors) to {}",
                blockCount, stateCount, errorCount, outFile);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private JsonObject dumpBlock(Block block) {
        ResourceLocation rl = ForgeRegistries.BLOCKS.getKey(block);
        int blockId = net.minecraft.core.Registry.BLOCK.getId(block);
        StateDefinition<Block, BlockState> def = block.getStateDefinition();

        // Sort properties alphabetically by name - matches Mojang's own
        // StateDefinition.Builder (ImmutableSortedMap<String, Property<?>>)
        // and the vanilla debug-screen / data-report convention.
        List<Property<?>> props = new ArrayList<>(def.getProperties());
        props.sort(Comparator.comparing(Property::getName));

        JsonObject blockObj = new JsonObject();
        blockObj.addProperty("id", blockId);
        blockObj.addProperty("name", rl.toString());

        JsonArray propsArr = new JsonArray();
        for (Property<?> p : props) {
            JsonObject po = new JsonObject();
            po.addProperty("name", p.getName());
            JsonArray values = new JsonArray();
            for (Object v : p.getPossibleValues()) {
                values.add(((Property) p).getName((Comparable) v));
            }
            po.add("values", values);
            propsArr.add(po);
        }
        blockObj.add("properties", propsArr);

        BlockState defaultState = block.defaultBlockState();

        JsonArray statesArr = new JsonArray();
        for (BlockState state : def.getPossibleStates()) {
            JsonObject so = new JsonObject();
            int globalId = Block.BLOCK_STATE_REGISTRY.getId(state);
            so.addProperty("globalId", globalId);
            so.addProperty("default", state.equals(defaultState));

            JsonObject propVals = new JsonObject();
            for (Property<?> p : props) {
                propVals.addProperty(p.getName(), getValueString(state, p));
            }
            so.add("properties", propVals);

            // Best-effort collision shape. Wrapped defensively: some modded
            // blocks implement custom shape logic that assumes a real Level
            // and may throw against EmptyBlockGetter. On failure we fall back
            // to a heuristic based on the block's Material.
            VoxelShape shape;
            boolean shapeOk = true;
            try {
                shape = state.getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
            } catch (Throwable t) {
                shapeOk = false;
                shape = null;
            }

            boolean solidFullCube;
            JsonArray aabbs = new JsonArray();
            if (shapeOk) {
                solidFullCube = !shape.isEmpty() && Block.isShapeFullBlock(shape);
                for (AABB box : shape.toAabbs()) {
                    JsonArray a = new JsonArray();
                    a.add(box.minX); a.add(box.minY); a.add(box.minZ);
                    a.add(box.maxX); a.add(box.maxY); a.add(box.maxZ);
                    aabbs.add(a);
                }
            } else {
                Material mat = state.getMaterial();
                solidFullCube = mat != null && mat.isSolid();
                if (solidFullCube) {
                    JsonArray a = new JsonArray();
                    a.add(0.0); a.add(0.0); a.add(0.0);
                    a.add(1.0); a.add(1.0); a.add(1.0);
                    aabbs.add(a);
                }
            }
            so.addProperty("solidFullCube", solidFullCube);
            so.add("collisionAABBs", aabbs);

            // Best-effort extras. These do NOT affect chunk-parsing
            // correctness (name/id/collision only need the fields above) -
            // they only improve fidelity of digging/tool-selection heuristics
            // in mineflayer. Any failure defaults harmlessly.
            try {
                so.addProperty("lightEmission", state.getLightEmission());
            } catch (Throwable ignored) {
                so.addProperty("lightEmission", 0);
            }
            try {
                Material mat = state.getMaterial();
                so.addProperty("material", mat != null ? mat.toString() : "unknown");
            } catch (Throwable ignored) {
                so.addProperty("material", "unknown");
            }

            statesArr.add(so);
        }
        blockObj.add("states", statesArr);
        return blockObj;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private static String getValueString(BlockState state, Property prop) {
        Comparable value = state.getValue(prop);
        return prop.getName(value);
    }
}
