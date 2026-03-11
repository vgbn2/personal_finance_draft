/*
 * Filename: C03029.c
 * Description: C Program
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

bool check(char s[])
{
    for (int i = 0; i < strlen(s); i++)
    {
        int tg = s[i] - '0';
        if (tg % 2 != 0)
            return 0;
    }
    return 1;
}

// Entry point
int main()
{
    int t;
    scanf("%d\n", &t); // Read input
    while (t--)
    {
        char s[20];
        scanf("%s", &s); // Read input
        if (check(s))
            printf("YES\n"); // Print result
        else
            printf("NO\n"); // Print result
    }
    return 0;
}