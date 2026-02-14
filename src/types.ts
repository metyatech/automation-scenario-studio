export type Point = {
  x: number;
  y: number;
};

export type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnnotationSpec =
  | {
      type: "click";
      box: Box;
    }
  | {
      type: "dragDrop";
      from: Point;
      to: Point;
    };

export type StepArtifact = {
  id: string;
  title: string;
  description?: string;
  imagePath: string;
  annotation?: AnnotationSpec;
  startedAtMs?: number;
  endedAtMs?: number;
};

export type RunArtifacts = {
  scenarioId: string;
  title: string;
  steps: StepArtifact[];
  videoPath?: string;
  rawVideoPath?: string;
};

export type VideoTimelineEvent =
  | {
      type: "click";
      startSeconds: number;
      endSeconds: number;
      box: Box;
    }
  | {
      type: "dragDrop";
      startSeconds: number;
      endSeconds: number;
      from: Point;
      to: Point;
    };
