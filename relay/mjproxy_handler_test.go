package relay

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCoverMidjourneyTaskDtoReturnsUpstreamImageUrls(t *testing.T) {
	originalForwardURLSetting := setting.MjForwardUrlEnabled
	setting.MjForwardUrlEnabled = false
	t.Cleanup(func() {
		setting.MjForwardUrlEnabled = originalForwardURLSetting
	})

	task := coverMidjourneyTaskDto(nil, &model.Midjourney{
		MjId:      "task-1",
		ImageUrl:  "https://example.com/grid.png",
		ImageUrls: `["https://example.com/1.png","https://example.com/2.png"]`,
	})

	assert.Equal(t, "https://example.com/grid.png", task.ImageUrl)
	assert.JSONEq(t, `["https://example.com/1.png","https://example.com/2.png"]`, string(task.ImageUrls))
}

func TestCoverMidjourneyTaskDtoDoesNotFabricateImageUrls(t *testing.T) {
	originalForwardURLSetting := setting.MjForwardUrlEnabled
	setting.MjForwardUrlEnabled = false
	t.Cleanup(func() {
		setting.MjForwardUrlEnabled = originalForwardURLSetting
	})

	task := coverMidjourneyTaskDto(nil, &model.Midjourney{
		MjId:     "task-1",
		ImageUrl: "https://example.com/grid.png",
	})

	assert.NotEmpty(t, task.ImageUrl)
	assert.NotNil(t, task.ImageUrls)
	assert.JSONEq(t, `[]`, string(task.ImageUrls))
}

func TestMidjourneyDtoPreservesImageUrlsShape(t *testing.T) {
	var task dto.MidjourneyDto
	err := common.Unmarshal([]byte(`{
		"id": "task-1",
		"imageUrls": [
			{"url": "https://example.com/1.png"},
			{"url": "https://example.com/2.png"}
		]
	}`), &task)
	require.NoError(t, err)

	response, err := common.Marshal(task)
	require.NoError(t, err)

	var fields map[string]json.RawMessage
	require.NoError(t, common.Unmarshal(response, &fields))
	assert.JSONEq(t, `[
		{"url": "https://example.com/1.png"},
		{"url": "https://example.com/2.png"}
	]`, string(fields["imageUrls"]))
}

func TestFetchMidjourneyImageUrlsFromUpstream(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/mj/task/task-1/fetch", r.URL.Path)
		assert.Equal(t, "secret", r.Header.Get("mj-api-secret"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id": "task-1",
			"imageUrls": [
				"https://example.com/1.png",
				"https://example.com/2.png"
			]
		}`))
	}))
	defer upstream.Close()

	baseURL := upstream.URL
	imageUrls, err := fetchMidjourneyImageUrls(context.Background(), &model.Channel{
		BaseURL: &baseURL,
		Key:     "secret",
	}, "task-1")
	require.NoError(t, err)
	assert.JSONEq(t, `[
		"https://example.com/1.png",
		"https://example.com/2.png"
	]`, string(imageUrls))
}
