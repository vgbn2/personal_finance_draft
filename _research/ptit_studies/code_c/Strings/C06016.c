/*
 * Filename: C06016.c
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
    char s1[101], s2[101];
    gets(s1);
    gets(s2);
    int p;
    scanf("%d", &p); // Read input
    int P = p - 1;
    int l1 = strlen(s1);
    int l2 = strlen(s2);
    for (int i = 0; i < l1 + l2; i++)
    {
        if (i < P)
            printf("%c", s1[i]); // Print result
        else if (i >= P && i < P + l2)
            printf("%c", s2[i - P]); // Print result
        else
            printf("%c", s1[i - l2]); // Print result
    }
    return 0;
}