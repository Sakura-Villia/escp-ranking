export interface TagAlias {
  tag: string;
  joinedNum: number;
  tagViewCount: number;
  lastUpdated: string;
  error?: string;
}

export interface TagGroup {
  id: string;
  name: string; // 分组名称，如 "雷泉"、"泉雷"、"组合"
  aliases: TagAlias[];
}

export interface CPItem {
  id: string;
  displayName: string;
  isCombination: boolean; // 是否为组合名（如"狮心组"），组合名需要区分左右位分组
  groups: TagGroup[];
  totalJoinedNum: number;
}

export interface ApiResponse {
  success: boolean;
  data: TagAlias[];
  error?: string;
}

// 旧数据格式（用于迁移）
export interface LegacyCPItem {
  id: string;
  displayName: string;
  aliases: TagAlias[];
  totalJoinedNum: number;
}
