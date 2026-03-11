#include <stdio.h>
#include <string.h>
void Swap(char a[], char b[])
{
    char tmp[505];
    strcpy(tmp, a);
    strcpy(a, b);
    strcpy(b, tmp);
}
int compare(char a[], char b[])
{
    if (strlen(a) > strlen(b))
        return 1;
    if (strlen(a) < strlen(b))
        return -1;
    return strcmp(a, b);
}

void solve()
{
    char a[505], b[505];
    scanf("%s %s", a, b);
    if (compare(a, b) < 0)
        Swap(a, b);
    int i = strlen(a) - 1;
    int j = strlen(b) - 1;
    char res[505];
    int n = i;
    res[n + 1] = '\0';
    int rem = 0;
    while (j >= 0)
    {
        int digit = (a[i--] - '0') + (b[j--] - '0') + rem;
        rem = digit / 10;
        res[n--] = digit % 10 + '0';
    }
    while (i >= 0)
    {
        int digit = (a[i--] - '0') + rem;
        rem = digit / 10;
        res[n--] = digit % 10 + '0';
    }
    if (rem == 1)
        printf("1");
    puts(res);
}

int main()
{
    int t;
    scanf("%d", &t);
    while (t--)
        solve();
    return 0;
}