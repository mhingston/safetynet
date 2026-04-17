export interface Fragment {
  raw: string;
  filePath: string;
  startLine: number;
  commitSha: string;
  authorName: string;
  authorEmail: string;
  commitDate: string;
  commitMessage: string;
  windowsFilePath: string;
  symlinkFile: string;
}