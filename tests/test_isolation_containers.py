"""Tests for isolation backend container management (no actual Docker)."""

import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from vibedeck.backends.isolation.containers import ContainerManager


@pytest.fixture
def users_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def manager(users_dir):
    return ContainerManager(
        image="claude-sandbox",
        runtime="runsc",
        memory="2g",
        cpus="1",
        users_dir=users_dir,
        env_vars={"ANTHROPIC_API_KEY": "sk-test-123"},
    )


class TestBuildExecCommand:
    """Test docker exec command building."""

    def test_basic_exec_command(self, manager):
        """Should build docker exec with claude and --dangerously-skip-permissions."""
        cmd = manager.build_exec_command("alice", ["-p", "--resume", "sess-123"])
        assert cmd == [
            "docker", "exec", "sandbox-alice",
            "claude", "--dangerously-skip-permissions",
            "-p", "--resume", "sess-123",
        ]

    def test_exec_command_with_stdin_arg(self, manager):
        """Should pass through arbitrary claude args."""
        cmd = manager.build_exec_command("bob", ["-p"])
        assert cmd == [
            "docker", "exec", "sandbox-bob",
            "claude", "--dangerously-skip-permissions",
            "-p",
        ]

    def test_exec_interactive_flag(self, manager):
        """Exec with -i for stdin passthrough."""
        cmd = manager.build_exec_command("alice", ["-p"], interactive=True)
        assert cmd[:3] == ["docker", "exec", "-i"]
        assert "sandbox-alice" in cmd


class TestBuildCreateCommand:
    """Test docker create command building."""

    def test_basic_create_command(self, manager):
        """Should build docker create with bind-mount, runtime, limits, env."""
        cmd = manager.build_create_command("alice")
        assert cmd[0:2] == ["docker", "create"]
        assert "--name" in cmd
        assert "sandbox-alice" in cmd
        assert "--runtime=runsc" in cmd
        assert "--memory=2g" in cmd
        assert "--cpus=1" in cmd
        assert f"-v" in cmd
        assert "-e" in cmd
        assert "IS_SANDBOX=1" in cmd

    def test_create_command_env_vars(self, manager):
        """Should pass env vars with -e flags."""
        cmd = manager.build_create_command("alice")
        # Find the -e flags
        env_pairs = []
        for i, arg in enumerate(cmd):
            if arg == "-e" and i + 1 < len(cmd):
                env_pairs.append(cmd[i + 1])
        assert "ANTHROPIC_API_KEY=sk-test-123" in env_pairs
        assert "IS_SANDBOX=1" in env_pairs

    def test_create_command_bind_mount(self, manager, users_dir):
        """Should bind-mount user directory as /root."""
        cmd = manager.build_create_command("alice")
        bind_mount = f"{users_dir}/alice:/root"
        # Find -v flag value
        for i, arg in enumerate(cmd):
            if arg == "-v" and i + 1 < len(cmd):
                assert cmd[i + 1] == bind_mount
                break
        else:
            pytest.fail(f"No -v flag found in {cmd}")

    def test_create_command_sleep_infinity(self, manager):
        """Container should run sleep infinity as two separate args."""
        cmd = manager.build_create_command("alice")
        assert cmd[-3:] == ["claude-sandbox", "sleep", "infinity"]


class TestContainerName:
    """Test container naming."""

    def test_container_name_format(self, manager):
        """Container name should be sandbox-{user_id}."""
        assert manager.get_container_name("alice") == "sandbox-alice"
        assert manager.get_container_name("12345678") == "sandbox-12345678"


class TestGetUserDir:
    """Test user directory resolution."""

    def test_returns_user_dir(self, manager, users_dir):
        """Should return users_dir/user_id."""
        assert manager.get_user_dir("alice") == users_dir / "alice"


class TestLoadEnvFile:
    """Test .env file loading."""

    def test_loads_env_file(self, users_dir):
        """Should parse KEY=VALUE pairs from env file."""
        from vibedeck.backends.isolation.containers import load_env_file

        env_file = users_dir / ".env"
        env_file.write_text(
            "ANTHROPIC_API_KEY=sk-ant-123\n"
            "# This is a comment\n"
            "\n"
            "CLAUDE_CODE_USE_FOUNDRY=1\n"
        )
        env_vars = load_env_file(env_file)
        assert env_vars == {
            "ANTHROPIC_API_KEY": "sk-ant-123",
            "CLAUDE_CODE_USE_FOUNDRY": "1",
        }

    def test_returns_empty_for_missing_file(self):
        """Should return empty dict for missing env file."""
        from vibedeck.backends.isolation.containers import load_env_file

        env_vars = load_env_file(Path("/nonexistent/.env"))
        assert env_vars == {}


class TestEnsureUserDir:
    """Test user directory provisioning."""

    def test_creates_directory_structure(self, manager, users_dir):
        """Should create .local/share/claude/versions and .local/bin."""
        manager._ensure_user_dir("newuser")

        user_dir = users_dir / "newuser"
        assert (user_dir / ".local" / "share" / "claude" / "versions").is_dir()
        assert (user_dir / ".local" / "bin").is_dir()

    def test_hardlinks_binary_from_shared(self, manager, users_dir):
        """Should hardlink claude binary from .shared/ directory."""
        # Set up .shared with a fake binary
        shared_dir = users_dir / ".shared"
        shared_dir.mkdir()
        binary = shared_dir / "2.1.50"
        binary.write_bytes(b"fake-claude-binary")

        manager._ensure_user_dir("newuser")

        target = users_dir / "newuser" / ".local" / "share" / "claude" / "versions" / "2.1.50"
        assert target.exists()
        assert target.read_bytes() == b"fake-claude-binary"
        # Verify it's a hardlink (same inode)
        assert target.stat().st_ino == binary.stat().st_ino

    def test_skips_existing_binary(self, manager, users_dir):
        """Should not overwrite if binary already exists."""
        shared_dir = users_dir / ".shared"
        shared_dir.mkdir()
        (shared_dir / "2.1.50").write_bytes(b"new-version")

        # Pre-create user with existing binary
        target = users_dir / "newuser" / ".local" / "share" / "claude" / "versions" / "2.1.50"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"old-version")

        manager._ensure_user_dir("newuser")

        assert target.read_bytes() == b"old-version"

    def test_works_without_shared_dir(self, manager, users_dir):
        """Should still create dirs even if .shared/ doesn't exist."""
        manager._ensure_user_dir("newuser")

        user_dir = users_dir / "newuser"
        assert (user_dir / ".local" / "share" / "claude" / "versions").is_dir()

    def test_idempotent(self, manager, users_dir):
        """Calling twice should not fail."""
        manager._ensure_user_dir("newuser")
        manager._ensure_user_dir("newuser")

        assert (users_dir / "newuser" / ".local" / "bin").is_dir()


class TestEnsureContainer:
    """Test async container lifecycle management."""

    @pytest.mark.asyncio
    async def test_creates_container_when_not_found(self, manager):
        """Should provision user dir, create and start container when it doesn't exist."""
        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))

        # First call: inspect fails (container not found)
        inspect_proc = AsyncMock()
        inspect_proc.communicate = AsyncMock(
            return_value=(b"", b"Error: No such object")
        )
        inspect_proc.returncode = 1

        # Second call: create succeeds
        create_proc = AsyncMock()
        create_proc.communicate = AsyncMock(return_value=(b"abc123\n", b""))
        create_proc.returncode = 0

        # Third call: start succeeds
        start_proc = AsyncMock()
        start_proc.communicate = AsyncMock(return_value=(b"", b""))
        start_proc.returncode = 0

        call_count = 0
        procs = [inspect_proc, create_proc, start_proc]

        async def mock_create_subprocess(*args, **kwargs):
            nonlocal call_count
            proc = procs[call_count]
            call_count += 1
            return proc

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create_subprocess):
            await manager.ensure_container("alice")

        assert call_count == 3
        # Verify user dir was provisioned
        assert (manager.get_user_dir("alice") / ".local" / "bin").is_dir()

    @pytest.mark.asyncio
    async def test_starts_stopped_container(self, manager):
        """Should start container when it exists but is stopped."""
        # inspect returns "false" (not running)
        inspect_proc = AsyncMock()
        inspect_proc.communicate = AsyncMock(return_value=(b"false\n", b""))
        inspect_proc.returncode = 0

        # start succeeds
        start_proc = AsyncMock()
        start_proc.communicate = AsyncMock(return_value=(b"", b""))
        start_proc.returncode = 0

        call_count = 0
        procs = [inspect_proc, start_proc]

        async def mock_create_subprocess(*args, **kwargs):
            nonlocal call_count
            proc = procs[call_count]
            call_count += 1
            return proc

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create_subprocess):
            await manager.ensure_container("alice")

        assert call_count == 2  # inspect + start, no create

    @pytest.mark.asyncio
    async def test_noop_when_running(self, manager):
        """Should do nothing when container is already running."""
        inspect_proc = AsyncMock()
        inspect_proc.communicate = AsyncMock(return_value=(b"true\n", b""))
        inspect_proc.returncode = 0

        call_count = 0

        async def mock_create_subprocess(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return inspect_proc

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create_subprocess):
            await manager.ensure_container("alice")

        assert call_count == 1  # only inspect

    @pytest.mark.asyncio
    async def test_raises_on_create_failure(self, manager):
        """Should raise ContainerError when container creation fails."""
        from vibedeck.backends.isolation.containers import ContainerError

        # inspect: not found
        inspect_proc = AsyncMock()
        inspect_proc.communicate = AsyncMock(return_value=(b"", b"No such object"))
        inspect_proc.returncode = 1

        # create: fails (after _ensure_user_dir succeeds)
        create_proc = AsyncMock()
        create_proc.communicate = AsyncMock(
            return_value=(b"", b"image not found: claude-sandbox")
        )
        create_proc.returncode = 1

        procs = [inspect_proc, create_proc]
        call_count = 0

        async def mock_create_subprocess(*args, **kwargs):
            nonlocal call_count
            proc = procs[call_count]
            call_count += 1
            return proc

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create_subprocess):
            with pytest.raises(ContainerError, match="Failed to create container"):
                await manager.ensure_container("alice")

    @pytest.mark.asyncio
    async def test_raises_on_start_failure(self, manager):
        """Should raise RuntimeError when container start fails."""
        from vibedeck.backends.isolation.containers import ContainerError

        # inspect: stopped
        inspect_proc = AsyncMock()
        inspect_proc.communicate = AsyncMock(return_value=(b"false\n", b""))
        inspect_proc.returncode = 0

        # start: fails
        start_proc = AsyncMock()
        start_proc.communicate = AsyncMock(
            return_value=(b"", b"cannot start container")
        )
        start_proc.returncode = 1

        procs = [inspect_proc, start_proc]
        call_count = 0

        async def mock_create_subprocess(*args, **kwargs):
            nonlocal call_count
            proc = procs[call_count]
            call_count += 1
            return proc

        with patch("asyncio.create_subprocess_exec", side_effect=mock_create_subprocess):
            with pytest.raises(ContainerError, match="Failed to start container"):
                await manager.ensure_container("alice")
