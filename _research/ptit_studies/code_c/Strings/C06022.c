/*
 * Filename: C06022.c
 * Description: C Program using functions: solve
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
#include <stdbool.h>

bool cmp(char s1[], char s2[])
{
    char a[205] = {};
    char b[205] = {};
    strcpy(a, s1);
    strcpy(b, s2);
    for (int i = 0; i < strlen(a); i++)
        if (a[i] >= 'A' && a[i] <= 'Z')
            a[i] += 32;
    for (int i = 0; i < strlen(b); i++)
        if (b[i] >= 'A' && b[i] <= 'Z')
            b[i] += 32;
    if (strcmp(a, b) == 0)
        return 1;
    return 0;
}

void solve(int t)
{
    char s1[205] = {};
    gets(s1);
    char s2[25] = {};
    gets(s2);
    char res[205][205] = {};
    int n = 0;

    // Tách các từ ở s1 ra, lưu vào res[]
    char *token = strtok(s1, " ");
    while (token != NULL)
    {
        strcpy(res[n++], token);
        token = strtok(NULL, " ");
    }

    // Kiểm tra và in ra kết quả
    printf("Test %d: ", t); // Print result
    for (int i = 0; i < n; i++)
        if (!cmp(res[i], s2))
            printf("%s ", res[i]); // Print result
    printf("\n"); // Print result
}

// Entry point
int main()
{
    int T;
    scanf("%d\n", &T); // Read input
    for (int t = 1; t <= T; t++)
        solve(t);
    return 0;
}