import { IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { AGENT_STATUS, AgentStatusCode } from "@pg-system/shared";

export class ChangeAgentStatusDto {
  @ApiProperty({
    description: "변경할 대리점 상태",
    example: "ACTIVE",
    enum: Object.values(AGENT_STATUS),
  })
  @IsEnum(AGENT_STATUS)
  status!: AgentStatusCode;
}
