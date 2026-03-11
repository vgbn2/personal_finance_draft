/*
 * Filename: C06007.c
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

// Entry point
int main()
{
    char s1[100];
    gets(s1);
    char s2[100];
    scanf("%s", s2); // Read input
    char a[100][100];
    int len = 0;
    char *token = strtok(s1, " ");
    while (token != NULL)
    {
        strcpy(a[len++], token);
        token = strtok(NULL, " ");
    }
    for (int i = 0; i < len; i++)
        if (strcmp(a[i], s2) != 0)
            printf("%s ", a[i]); // Print result
    return 0;
}