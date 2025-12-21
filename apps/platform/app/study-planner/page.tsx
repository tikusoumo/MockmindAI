"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Note = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
};

type MindNodeData = {
  label: string;
};

type MindNode = Node<MindNodeData>;

type StoredPlanner = {
  notes: Note[];
  mindmap: {
    nodes: MindNode[];
    edges: Edge[];
  };
};

const STORAGE_KEY = "study_planner_v1";

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `id_${Date.now().toString(16)}_${Math.floor(performance.now()).toString(16)}`;
}

const DEFAULT_NOTES: Note[] = [
  {
    id: "note_1",
    title: "React Hooks — Key Patterns",
    body: "- Prefer derived state over syncing\n- Memoize callbacks used in deep trees\n- Watch for stale closures in async",
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
  },
];

const DEFAULT_MINDMAP = {
  nodes: [
    {
      id: "mind_root",
      position: { x: 0, y: 0 },
      data: { label: "System Design" },
      type: "default",
    },
    {
      id: "mind_req",
      position: { x: 260, y: -110 },
      data: { label: "Requirements" },
      type: "default",
    },
    {
      id: "mind_arch",
      position: { x: 260, y: 110 },
      data: { label: "High-level Architecture" },
      type: "default",
    },
    {
      id: "mind_data",
      position: { x: 520, y: 110 },
      data: { label: "Data Model" },
      type: "default",
    },
  ] satisfies MindNode[],
  edges: [
    { id: "e_root_req", source: "mind_root", target: "mind_req" },
    { id: "e_root_arch", source: "mind_root", target: "mind_arch" },
    { id: "e_arch_data", source: "mind_arch", target: "mind_data" },
  ] satisfies Edge[],
};

export default function StudyPlannerPage() {
  // Notes
  const [notes, setNotes] = React.useState<Note[]>(DEFAULT_NOTES);
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftBody, setDraftBody] = React.useState("");

  // Mind Map
  const [nodes, setNodes, onNodesChange] = useNodesState<MindNode>(
    DEFAULT_MINDMAP.nodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT_MINDMAP.edges);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = React.useState("");
  const [isLoaded, setIsLoaded] = React.useState(false);

  // Load + persist
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setIsLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw) as StoredPlanner;
      if (Array.isArray(parsed.notes)) setNotes(parsed.notes);
      const maybeNodes = parsed.mindmap?.nodes;
      const maybeEdges = parsed.mindmap?.edges;
      const nodesOk =
        Array.isArray(maybeNodes) &&
        maybeNodes.every(
          (n) =>
            typeof n?.id === "string" &&
            typeof n?.position?.x === "number" &&
            typeof n?.position?.y === "number" &&
            typeof (n as MindNode).data?.label === "string"
        );
      const edgesOk =
        Array.isArray(maybeEdges) &&
        maybeEdges.every(
          (e) =>
            typeof e?.id === "string" &&
            typeof e?.source === "string" &&
            typeof e?.target === "string"
        );

      if (nodesOk && edgesOk) {
        setNodes(maybeNodes as MindNode[]);
        setEdges(maybeEdges as Edge[]);
      }
    } catch {
      // ignore
    } finally {
      setIsLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!isLoaded) return;
    const handle = setTimeout(() => {
      try {
        const payload: StoredPlanner = {
          notes,
          mindmap: { nodes, edges },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [notes, nodes, edges, isLoaded]);

  React.useEffect(() => {
    if (!selectedNodeId) {
      setSelectedLabel("");
      return;
    }
    const node = nodes.find((n) => n.id === selectedNodeId);
    setSelectedLabel(node?.data?.label ?? "");
  }, [selectedNodeId, nodes]);

  const addNote = () => {
    const title = draftTitle.trim();
    const body = draftBody.trim();
    if (!title && !body) return;

    setNotes((prev) => [
      {
        id: newId(),
        title: title || "Untitled",
        body,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
    setDraftTitle("");
    setDraftBody("");
  };

  const removeNote = (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const onConnect = React.useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, id: newId() }, eds));
    },
    [setEdges]
  );

  const addNode = (parentId?: string) => {
    const id = newId();
    const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
    const position = parent
      ? { x: parent.position.x + 260, y: parent.position.y + 0 }
      : { x: 0, y: 0 };

    setNodes((prev) => [
      ...prev,
      {
        id,
        type: "default",
        position,
        data: { label: "New Node" },
      },
    ]);

    if (parentId) {
      setEdges((prev) => [
        ...prev,
        {
          id: newId(),
          source: parentId,
          target: id,
        },
      ]);
    }

    setSelectedNodeId(id);
  };

  const saveSelectedLabel = () => {
    if (!selectedNodeId) return;
    const next = selectedLabel.trim();
    if (!next) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNodeId ? { ...n, data: { ...n.data, label: next } } : n
      )
    );
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    const id = selectedNodeId;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Study Planner</h1>
          <p className="text-muted-foreground">
            Notes, mind maps, and a node-based roadmap.
          </p>
        </div>
      </div>

      <Tabs defaultValue="notes" className="w-full">
        <TabsList>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="mindmap">Mind Map</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>New Note</CardTitle>
                <CardDescription>Capture key learnings fast.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="note-title">Title</Label>
                  <Input
                    id="note-title"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="e.g. React rendering"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note-body">Notes</Label>
                  <Textarea
                    id="note-body"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Write bullet points, snippets, reminders…"
                    className="min-h-40"
                  />
                </div>
                <Button onClick={addNote} className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Note
                </Button>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 grid gap-4">
              {notes.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>No notes yet</CardTitle>
                    <CardDescription>Add your first note on the left.</CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                notes.map((note) => (
                  <Card key={note.id}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div className="space-y-1">
                        <CardTitle className="text-base">{note.title}</CardTitle>
                        <CardDescription>
                          {new Date(note.createdAt).toLocaleString()}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => removeNote(note.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <pre className="whitespace-pre-wrap text-sm text-foreground/90">
                        {note.body || "(empty)"}
                      </pre>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="mindmap" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Mind Map Controls</CardTitle>
                <CardDescription>
                  Drag nodes, connect handles, and build your map.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => addNode()}>
                    <Plus className="mr-2 h-4 w-4" /> Node
                  </Button>
                  <Button className="flex-1" onClick={() => addNode(selectedNodeId ?? undefined)} disabled={!selectedNodeId}>
                    <Plus className="mr-2 h-4 w-4" /> Child
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mind-title">Selected title</Label>
                  <Input
                    id="mind-title"
                    value={selectedLabel}
                    onChange={(e) => setSelectedLabel(e.target.value)}
                    placeholder={selectedNodeId ? "Node title" : "Select a node"}
                    disabled={!selectedNodeId}
                    onBlur={saveSelectedLabel}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveSelectedLabel();
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Drag to reposition. Connect nodes by dragging a handle.
                  </p>
                </div>

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={deleteSelectedNode}
                  disabled={!selectedNodeId}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete Node
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Mind Map</CardTitle>
                <CardDescription>Drag-and-drop nodes with connectors.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-130 overflow-hidden rounded-lg border bg-muted/20">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    fitView
                    onSelectionChange={(sel) => {
                      const first = sel.nodes?.[0];
                      setSelectedNodeId(first?.id ?? null);
                    }}
                  >
                    <Background />
                    <MiniMap />
                    <Controls />
                  </ReactFlow>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
