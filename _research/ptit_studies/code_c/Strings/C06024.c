/*
 * Filename: C06024.c
 * Description: C Program using functions: Swap, Compare, solve
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <string.h>

void Swap(char a[], char b[])
{
    char tmp[505];
    strcpy(tmp, a);
    strcpy(a, b);
    strcpy(b, tmp);
}

int Compare(char a[], char b[])
{
    if (strlen(a) > strlen(b))
        return 1;
    if (strlen(a) < strlen(b))
        return -1;
    return strcmp(a, b);
}

// Function to solve specific test case
void solve()
{
    char a[505], b[505];
    scanf("%s %s", a, b); // Read input
    if (Compare(a, b) < 0)
        Swap(a, b);

    int i = strlen(a) - 1;
    int j = strlen(b) - 1;
    char res[505];
    int n = i;
    res[n + 1] = '\0';
    int remember = 0;
    while (j >= 0)
    {
        int digit = (a[i--] - '0') + (b[j--] - '0') + remember;
        remember = digit / 10;
        res[n--] = digit % 10 + '0';
    }
    while (i >= 0)
    {
        int digit = (a[i--] - '0') + remember;
        remember = digit / 10;
        res[n--] = digit % 10 + '0';
    }
    if (remember == 1)
        printf("1"); // Print result
    puts(res);
}

// Entry point
int main()
{
    int t;
    scanf("%d", &t); // Read input
    while (t--)
        solve();
    return 0;
}