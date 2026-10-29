/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useState, useEffect } from "react";
import { Card, Typography, Avatar, Tag, Spin } from "@douyinfe/semi-ui";
import { Gauge, Clock, CheckCircle, Activity } from "lucide-react";
import { API, showError } from "../../../../helpers";
import { useTranslation } from "react-i18next";

const sourceLabels = {
	user: { text: "用户级别", color: "red" },
	group: { text: "分组级别", color: "orange" },
	global: { text: "全局级别", color: "blue" },
};

const RateLimitInfo = () => {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(true);
	const [rateLimit, setRateLimit] = useState(null);

	useEffect(() => {
		fetchRateLimit();
	}, []);

	const fetchRateLimit = async () => {
		try {
			setLoading(true);
			const res = await API.get("/api/user/rate_limit");
			const { success, data, message } = res.data;
			if (success) {
				setRateLimit(data);
			} else {
				showError(message);
			}
		} catch (error) {
			// silently fail
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<Card className="!rounded-2xl shadow-sm border-0">
				<div className="flex items-center justify-center py-8">
					<Spin />
				</div>
			</Card>
		);
	}

	if (!rateLimit) return null;

	const { enabled, total_count, success_count, duration_minutes, source } =
		rateLimit;
	const sourceInfo = sourceLabels[source] || sourceLabels.global;

	// 如果全局未启用且不是用户级别限速，不显示
	if (!enabled && source === "global") return null;

	return (
		<Card className="!rounded-2xl shadow-sm border-0">
			{/* Card Header */}
			<div className="flex items-center mb-4">
				<Avatar size="small" color="amber" className="mr-3 shadow-md">
					<Gauge size={16} />
				</Avatar>
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<Typography.Text className="text-lg font-medium">
							{t("速率限制")}
						</Typography.Text>
						<Tag color={sourceInfo.color} size="small">
							{t(sourceInfo.text)}
						</Tag>
					</div>
					<div className="text-xs text-gray-600 dark:text-gray-400">
						{t("当前账户的API请求速率限制信息")}
					</div>
				</div>
			</div>

			{/* Rate Limit Details */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
				{/* Duration */}
				<Card className="!rounded-xl border dark:border-gray-700">
					<div className="flex items-center">
						<div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mr-3 flex-shrink-0">
							<Clock
								size={18}
								className="text-blue-600 dark:text-blue-400"
							/>
						</div>
						<div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								{t("时间窗口")}
							</div>
							<Typography.Text className="text-base font-semibold">
								{duration_minutes} {t("分钟")}
							</Typography.Text>
						</div>
					</div>
				</Card>

				{/* Success Count */}
				<Card className="!rounded-xl border dark:border-gray-700">
					<div className="flex items-center">
						<div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center mr-3 flex-shrink-0">
							<CheckCircle
								size={18}
								className="text-green-600 dark:text-green-400"
							/>
						</div>
						<div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								{t("成功请求上限")}
							</div>
							<Typography.Text className="text-base font-semibold">
								{success_count} {t("次")}
							</Typography.Text>
						</div>
					</div>
				</Card>

				{/* Total Count */}
				<Card className="!rounded-xl border dark:border-gray-700">
					<div className="flex items-center">
						<div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center mr-3 flex-shrink-0">
							<Activity
								size={18}
								className="text-amber-600 dark:text-amber-400"
							/>
						</div>
						<div>
							<div className="text-xs text-gray-500 dark:text-gray-400">
								{t("总请求上限")}
							</div>
							<Typography.Text className="text-base font-semibold">
								{total_count === 0 ? t("不限制") : `${total_count} ${t("次")}`}
							</Typography.Text>
						</div>
					</div>
				</Card>
			</div>

			{/* Summary */}
			<div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
				<Typography.Text type="tertiary">
					{total_count > 0
						? t("提示：每{{duration}}分钟内，最多可发起{{total}}次请求（含失败），其中成功请求不超过{{success}}次。", {
								duration: duration_minutes,
								total: total_count,
								success: success_count,
							})
						: t("提示：每{{duration}}分钟内，成功请求不超过{{success}}次，总请求数不限制。", {
								duration: duration_minutes,
								success: success_count,
							})}
				</Typography.Text>
			</div>
		</Card>
	);
};

export default RateLimitInfo;
